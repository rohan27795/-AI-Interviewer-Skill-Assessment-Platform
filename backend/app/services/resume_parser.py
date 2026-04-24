"""
Resume Parser Service
Uses LangChain + GPT-4o to extract structured data from PDF/DOCX resumes.
Implements vector embeddings via Supabase pgvector for JD matching.
"""
import json
import tempfile
import os
from typing import Dict, List, Optional, Tuple

import boto3
from openai import AsyncOpenAI
import pdfplumber
import docx2txt
import numpy as np

from app.core.config import settings
from app.core.database import get_supabase, get_pg_pool, get_redis
from app.schemas.schemas import ParsedResumeData
import logging
from langfuse import observe

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


RESUME_EXTRACTION_PROMPT = """
You are an expert HR assistant. Extract structured information from the following resume text.
Return a valid JSON object with exactly this schema:

{{
  "name": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "string or null",
  "total_years_experience": float,
  "skills": ["list", "of", "skills"],
  "experience": [
    {{
      "company": "string",
      "title": "string",
      "start_date": "YYYY-MM or null",
      "end_date": "YYYY-MM or null (null if current)",
      "is_current": boolean,
      "description": "string",
      "achievements": ["list"]
    }}
  ],
  "education": [
    {{
      "institution": "string",
      "degree": "string",
      "field": "string",
      "year": integer or null,
      "gpa": float or null
    }}
  ],
  "certifications": ["list"],
  "projects": [
    {{
      "name": "string",
      "description": "string",
      "technologies": ["list"]
    }}
  ],
  "languages": ["list"]
}}

Resume text:
{resume_text}

Return ONLY the JSON object, no markdown, no explanation.
"""


class ResumeParserService:
    """Service for parsing resumes and computing JD match scores."""

    async def extract_text_from_file(self, file_path: str) -> str:
        """Extract raw text from PDF or DOCX file."""
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext == ".pdf":
            text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() or ""
            return text
        
        elif ext in [".docx", ".doc"]:
            return docx2txt.process(file_path)
        
        else:
            raise ValueError(f"Unsupported file format: {ext}")

    @observe()
    async def parse_resume(self, resume_text: str) -> ParsedResumeData:
        """Use GPT-4o to extract structured data from resume text."""
        prompt = RESUME_EXTRACTION_PROMPT.format(resume_text=resume_text[:8000])
        
        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0,
                response_format={"type": "json_object"},
            )
            
            raw = response.choices[0].message.content
            data = json.loads(raw)
            return ParsedResumeData(**data)
        
        except Exception as e:
            logger.error(f"Resume parsing failed: {e}")
            # Return minimal data on failure
            return ParsedResumeData(name="Unknown", skills=[])

    async def get_embedding(self, text: str) -> List[float]:
        """Generate OpenAI text embedding for semantic search."""
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],
        )
        return response.data[0].embedding

    async def compute_match_score(
        self, parsed_resume: ParsedResumeData, job_id: str
    ) -> float:
        """
        Compute semantic similarity between resume and job description.
        Uses pgvector cosine similarity for accuracy.
        """
        # Check Redis cache first
        redis = await get_redis()
        cache_key = f"match:{job_id}:{hash(str(parsed_resume.skills))}"
        cached = await redis.get(cache_key)
        if cached:
            return float(cached)

        # Build resume text representation
        resume_text = f"""
        Skills: {', '.join(parsed_resume.skills)}
        Experience: {parsed_resume.total_years_experience} years
        Summary: {parsed_resume.summary or ''}
        Recent roles: {', '.join([e.get('title', '') for e in parsed_resume.experience[:3]])}
        """

        # Get resume embedding
        resume_embedding = await self.get_embedding(resume_text)
        
        # Fetch job embedding from Supabase (pre-stored when job was created)
        pool = await get_pg_pool()
        if not pool:
            print("DEBUG: No PG pool available, falling back to keyword match")
            return await self._keyword_match_score(parsed_resume, job_id)
            
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT requirements_embedding FROM jobs WHERE id = $1",
                job_id,
            )
        
        if not row or not row["requirements_embedding"]:
            # Fallback: keyword matching
            return await self._keyword_match_score(parsed_resume, job_id)
        
        # Cosine similarity
        job_embedding = row["requirements_embedding"]
        score = self._cosine_similarity(resume_embedding, job_embedding)
        
        # Cache for 1 hour
        await redis.setex(cache_key, 3600, str(score))
        return score

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    async def _keyword_match_score(
        self, parsed_resume: ParsedResumeData, job_id: str
    ) -> float:
        """Fallback keyword-based matching when vector embeddings unavailable."""
        supabase = get_supabase()
        job_resp = supabase.table("jobs").select("requirements").eq("id", job_id).single().execute()
        
        if not job_resp.data:
            return 0.5
        
        job_data = job_resp.data or {}
        requirements_list = job_data.get("requirements")
        if not requirements_list:
            return 0.5
            
        job_requirements = [r.lower() for r in requirements_list]
        candidate_skills = [s.lower() for s in parsed_resume.skills]
        
        if not job_requirements:
            return 0.5
        
        matches = sum(
            1 for req in job_requirements
            if any(req in skill or skill in req for skill in candidate_skills)
        )
        return matches / len(job_requirements)

    async def upload_resume_to_s3(
        self, file_bytes: bytes, filename: str, application_id: str
    ) -> str:
        """Upload resume file to AWS S3 and return the URL."""
        try:
            s3_client = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION,
            )
            
            key = f"resumes/{application_id}/{filename}"
            
            s3_client.put_object(
                Bucket=settings.AWS_S3_BUCKET,
                Key=key,
                Body=file_bytes,
                ContentType="application/pdf" if filename.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            
            return f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
        except Exception as e:
            logger.warning(f"S3 Upload failed, using local dummy URL: {e}")
            return f"/api/dummy-resume/{application_id}/{filename}"

    async def index_job_description(self, job_id: str, job_text: str):
        """
        Generate and store embedding for a job description.
        Called when a recruiter creates a new job posting.
        """
        embedding = await self.get_embedding(job_text)
        
        pool = await get_pg_pool()
        if not pool:
            print("Warning: Skipping vector storage as PG pool is unavailable.")
            return
            
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE jobs 
                SET requirements_embedding = $1::vector
                WHERE id = $2
                """,
                embedding,
                job_id,
            )
        
        # Cache the JD text for AI interview context
        redis = await get_redis()
        await redis.setex(f"job:text:{job_id}", 86400, job_text)  # 24h cache


# Singleton instance
resume_parser = ResumeParserService()
