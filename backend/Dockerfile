FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake gcc g++ libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS" \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data models_storage generated_projects

EXPOSE 8000

ENV INTELLIYASH_HOST=0.0.0.0
ENV INTELLIYASH_PORT=8000

CMD ["python", "run.py"]
