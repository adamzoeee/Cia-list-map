# task_scorer 推理服务 Dockerfile
FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY task_scorer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY task_scorer/ ./task_scorer/

# 模型文件通过 volume 挂载或环境变量指定路径
# 默认路径: /app/task_scorer/checkpoints/best_model
ENV MODEL_PATH=/app/task_scorer/checkpoints/best_model

EXPOSE 8001

CMD ["uvicorn", "task_scorer.server.app:app", "--host", "0.0.0.0", "--port", "8001"]
