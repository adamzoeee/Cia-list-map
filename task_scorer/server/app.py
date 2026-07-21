"""
FastAPI 推理服务
提供与前端兼容的 RESTful API:
    POST /predict        - 单任务分析
    POST /predict_batch  - 批量任务分析
    GET  /health         - 服务健康检查

启动方式:
    cd task_scorer
    python -m server.app
    # 或: uvicorn server.app:app --host 0.0.0.0 --port 8001 --reload
"""
import os
import sys
import json
from pathlib import Path
from typing import List, Dict, Optional
from contextlib import asynccontextmanager

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import BertTokenizer

# 将项目根目录加入路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model.model import TaskScorer
from .database import get_db, close_db
from . import database as db
from .models import (
    CreateTeamRequest, JoinTeamRequest, LeaveTeamRequest, DeleteTeamRequest,
    CreateTaskRequest, UpdateTaskRequest, DeleteTaskRequest,
)
from .collaboration import manager, to_camel_dict, to_camel_list


# ============== 配置 ==============
MODEL_PATH = os.environ.get("MODEL_PATH", "./checkpoints/best_model")
MODEL_NAME = "hfl/chinese-macbert-base"
MAX_LENGTH = 128
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ============== FastAPI 应用 ==============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：初始化数据库并加载模型。"""
    get_db()
    load_model()
    try:
        yield
    finally:
        close_db()


app = FastAPI(
    title="Task Scorer API",
    description="基于 MacBERT 的任务紧迫度/重要性评分服务",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS：允许前端跨域调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== 数据模型 ==============
class TaskInput(BaseModel):
    """单任务输入"""
    title: str = Field(..., min_length=1, max_length=100, description="任务标题")
    description: str = Field(default="", max_length=500, description="任务描述")


class BatchInput(BaseModel):
    """批量任务输入"""
    tasks: List[TaskInput] = Field(..., min_length=1, max_length=50, description="任务列表")


class PredictionOutput(BaseModel):
    """单任务预测输出 - 与前端 AIAnalysisResult 格式对齐"""
    title: str
    description: str
    urgency: int = Field(..., ge=-5, le=5, description="紧迫度 -5~5")
    importance: int = Field(..., ge=-5, le=5, description="重要性 -5~5")
    suggestion: str = Field(default="", description="建议（当前模型不支持生成，返回空字符串）")


class BatchOutput(BaseModel):
    """批量预测输出 - 与前端 ImageTaskDraft 格式对齐"""
    tasks: List[Dict]


# ============== 全局模型实例 ==============
model: Optional[TaskScorer] = None
tokenizer: Optional[BertTokenizer] = None


def get_suggestion(quadrant: int) -> str:
    """根据象限返回预设建议（替代模型生成）"""
    suggestions = {
        1: "立即执行，火烧眉毛",
        2: "安排时间，稳步推进",
        3: "有空再做，不急",
        4: "能拖就拖，价值有限",
    }
    return suggestions.get(quadrant, "")


def load_model():
    """加载模型和 Tokenizer"""
    global model, tokenizer

    model_path = Path(MODEL_PATH)
    if not model_path.exists():
        # 尝试从默认位置加载
        alt_path = Path(__file__).resolve().parent.parent / "checkpoints" / "best_model"
        if alt_path.exists():
            model_path = alt_path
        else:
            raise RuntimeError(
                f"找不到模型文件。请确保训练完成后的模型保存在 {MODEL_PATH} "
                f"或设置环境变量 MODEL_PATH"
            )

    print(f"[LoadModel] 加载模型 from {model_path}...")
    tokenizer = BertTokenizer.from_pretrained(str(model_path))
    # 加载训练后的同架构 checkpoint
    # model.py 中已添加 all_tied_weights_keys 属性兼容 transformers 4.42+
    model = TaskScorer.from_pretrained(str(model_path))
    model.to(DEVICE)
    model.eval()
    print(f"[LoadModel] 模型加载完成，使用设备: {DEVICE}")


# ============== API 路由 ==============
@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "device": str(DEVICE),
    }


@app.post("/predict", response_model=PredictionOutput)
async def predict_single(task: TaskInput):
    """
    单任务分析
    返回格式与前端 AIAnalysisResult 完全一致
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="模型未加载")

    # 拼接文本
    text = task.title.strip()
    if task.description.strip():
        text = f"{text}。{task.description.strip()}"

    # Tokenize
    encoding = tokenizer(
        text,
        max_length=MAX_LENGTH,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)

    # 推理
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)

    urgency = float(outputs["urgency"][0])
    importance = float(outputs["importance"][0])

    # 四舍五入到整数，并限制范围
    urgency_int = int(np.clip(round(urgency), -5, 5))
    importance_int = int(np.clip(round(importance), -5, 5))

    # 判断象限
    quadrant = 1 if urgency_int >= 0 and importance_int >= 0 else \
               2 if urgency_int < 0 and importance_int >= 0 else \
               3 if urgency_int < 0 and importance_int < 0 else 4

    return PredictionOutput(
        title=task.title,
        description=task.description,
        urgency=urgency_int,
        importance=importance_int,
        suggestion=get_suggestion(quadrant),
    )


@app.post("/predict_batch", response_model=BatchOutput)
async def predict_batch(batch: BatchInput):
    """
    批量任务分析 (用于 OCR 批量模式)
    返回格式与前端 ImageTaskDraft 数组对齐
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="模型未加载")

    texts = []
    for task in batch.tasks:
        text = task.title.strip()
        if task.description.strip():
            text = f"{text}。{task.description.strip()}"
        texts.append(text)

    # 批量 Tokenize
    encoding = tokenizer(
        texts,
        max_length=MAX_LENGTH,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)

    # 批量推理
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)

    results = []
    for i, task in enumerate(batch.tasks):
        urgency = float(outputs["urgency"][i])
        importance = float(outputs["importance"][i])
        urgency_int = int(np.clip(round(urgency), -5, 5))
        importance_int = int(np.clip(round(importance), -5, 5))

        results.append({
            "title": task.title,
            "description": task.description,
            "urgency": urgency_int,
            "importance": importance_int,
        })

    return BatchOutput(tasks=results)


# ============== 协作 API ==============

# ── 团队 ──

@app.post("/api/teams")
async def api_create_team(req: CreateTeamRequest):
    team = db.create_team(req.name, req.creator_user_id, req.creator_nickname)
    return {"team": to_camel_dict(team)}

@app.post("/api/teams/join")
async def api_join_team(req: JoinTeamRequest):
    team = db.get_team_by_invite_code(req.invite_code.upper())
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在，请检查邀请码")
    member = db.join_team(team["id"], req.user_id, req.nickname)
    if member is None:
        raise HTTPException(status_code=409, detail="你已在该团队中")
    tasks = db.list_tasks(team["id"])
    members = db.get_members(team["id"])
    await manager.broadcast(team["id"], "member_joined", {
        "member": member, "members": members
    })
    return {
        "team": to_camel_dict(team),
        "tasks": to_camel_list(tasks),
        "members": to_camel_list(members),
    }

@app.get("/api/teams/{team_id}")
async def api_get_team(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"team": to_camel_dict(team)}

@app.get("/api/teams/{team_id}/members")
async def api_get_members(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"members": to_camel_list(db.get_members(team_id))}

@app.post("/api/teams/{team_id}/leave")
async def api_leave_team(team_id: str, req: LeaveTeamRequest):
    if not db.leave_team(team_id, req.user_id):
        raise HTTPException(status_code=403, detail="创建者不能退出，请先解散团队")
    members = db.get_members(team_id)
    await manager.broadcast(team_id, "member_left", {
        "userId": req.user_id, "members": members
    })
    return {"ok": True}

@app.delete("/api/teams/{team_id}")
async def api_delete_team(team_id: str, req: DeleteTeamRequest):
    if not db.delete_team(team_id, req.user_id):
        raise HTTPException(status_code=403, detail="仅创建者可解散团队")
    return {"ok": True}

# ── 任务 ──

@app.get("/api/teams/{team_id}/tasks")
async def api_list_tasks(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"tasks": to_camel_list(db.list_tasks(team_id))}

@app.post("/api/teams/{team_id}/tasks")
async def api_create_task(team_id: str, req: CreateTaskRequest):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    task = db.create_task(team_id, req.title, req.description,
                          req.urgency, req.importance, req.quadrant, req.created_by)
    await manager.broadcast(team_id, "task_created", {"task": task})
    return {"task": to_camel_dict(task)}

@app.put("/api/teams/{team_id}/tasks/{task_id}")
async def api_update_task(team_id: str, task_id: str, req: UpdateTaskRequest):
    updates = {k: v for k, v in req.model_dump().items()
               if v is not None and k not in ("user_id",)}
    updates["version"] = req.version
    if "completed" in updates:
        updates["completed"] = 1 if updates["completed"] else 0

    task = db.update_task(task_id, req.user_id, updates)
    if task is None:
        exists = db.get_db().execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if exists:
            latest = dict(db.get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            raise HTTPException(status_code=409, detail={
                "message": "数据已被他人修改，请刷新",
                "task": to_camel_dict(latest)
            })
        raise HTTPException(status_code=404, detail="任务不存在")
    await manager.broadcast(team_id, "task_updated", {"task": task})
    return {"task": to_camel_dict(task)}

@app.delete("/api/teams/{team_id}/tasks/{task_id}")
async def api_delete_task(team_id: str, task_id: str, req: DeleteTaskRequest):
    if not db.delete_task(task_id, req.user_id):
        raise HTTPException(status_code=403, detail="仅创建者或团队创建者可删除")
    await manager.broadcast(team_id, "task_deleted", {"taskId": task_id})
    return {"ok": True}

# ── WebSocket ──

@app.websocket("/ws/{invite_code}")
async def ws_collaboration(websocket: WebSocket, invite_code: str):
    team = db.get_team_by_invite_code(invite_code.upper())
    if not team:
        await websocket.close(code=4004, reason="团队不存在")
        return
    await manager.connect(team["id"], websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(team["id"], websocket)


@app.get("/")
async def root():
    """API 信息"""
    return {
        "service": "Task Scorer API",
        "model": "hfl/chinese-macbert-base (双头回归)",
        "endpoints": {
            "predict": "POST /predict - 单任务分析",
            "predict_batch": "POST /predict_batch - 批量任务分析",
            "health": "GET /health - 健康检查",
            "create_team": "POST /api/teams - 创建团队",
            "join_team": "POST /api/teams/join - 加入团队",
            "get_team": "GET /api/teams/{team_id} - 获取团队",
            "get_members": "GET /api/teams/{team_id}/members - 获取成员",
            "leave_team": "POST /api/teams/{team_id}/leave - 退出团队",
            "delete_team": "DELETE /api/teams/{team_id} - 解散团队",
            "list_tasks": "GET /api/teams/{team_id}/tasks - 任务列表",
            "create_task": "POST /api/teams/{team_id}/tasks - 创建任务",
            "update_task": "PUT /api/teams/{team_id}/tasks/{task_id} - 更新任务",
            "delete_task": "DELETE /api/teams/{team_id}/tasks/{task_id} - 删除任务",
            "ws": "WS /ws/{invite_code} - 协作 WebSocket",
        },
    }


# ============== 主入口 ==============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
