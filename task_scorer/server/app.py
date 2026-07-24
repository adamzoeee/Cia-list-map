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

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import BertTokenizer

# 将项目根目录加入路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model.model import TaskScorer
import time as time_module
from server.group_manager import GroupManager, Group


# ============== 配置 ==============
MODEL_PATH = os.environ.get("MODEL_PATH", "./checkpoints/best_model")
MODEL_NAME = "hfl/chinese-macbert-base"
MAX_LENGTH = 128
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ============== FastAPI 应用 ==============
app = FastAPI(
    title="Task Scorer API",
    description="基于 MacBERT 的任务紧迫度/重要性评分服务",
    version="1.0.0",
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
group_manager: Optional[GroupManager] = None


def get_quadrant(urgency: int, importance: int) -> int:
    """根据紧迫度和重要性计算象限（1-4）"""
    if urgency >= 0 and importance >= 0:
        return 1
    if urgency < 0 and importance >= 0:
        return 2
    if urgency < 0 and importance < 0:
        return 3
    return 4


def get_suggestion(quadrant: int) -> str:
    """根据象限返回预设建议（替代模型生成）"""
    suggestions = {
        1: "立即执行，火烧眉毛",
        2: "安排时间，稳步推进",
        3: "有空再做，不急",
        4: "能拖就拖，价值有限",
    }
    return suggestions.get(quadrant, "")


def do_predict(title: str, description: str = "") -> dict:
    """单任务推理，返回 {title,description,urgency,importance,suggestion}"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")
    text = title.strip()
    if description.strip():
        text = f"{text}。{description.strip()}"
    encoding = tokenizer(
        text, max_length=MAX_LENGTH, padding="max_length",
        truncation=True, return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)
    urgency = float(outputs["urgency"][0])
    importance = float(outputs["importance"][0])
    urgency_int = int(np.clip(round(urgency), -5, 5))
    importance_int = int(np.clip(round(importance), -5, 5))
    quadrant = get_quadrant(urgency_int, importance_int)
    return {
        "title": title, "description": description,
        "urgency": urgency_int, "importance": importance_int,
        "suggestion": get_suggestion(quadrant),
    }


def do_predict_batch(tasks: list) -> list:
    """批量推理 [{"title","description"}] → [{"title","description","urgency","importance"}]"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")
    texts = []
    for t in tasks:
        text = t["title"].strip()
        if t.get("description", "").strip():
            text = f"{text}。{t['description'].strip()}"
        texts.append(text)
    encoding = tokenizer(
        texts, max_length=MAX_LENGTH, padding="max_length",
        truncation=True, return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)
    results = []
    for i, t in enumerate(tasks):
        results.append({
            "title": t["title"],
            "description": t.get("description", ""),
            "urgency": int(np.clip(round(float(outputs["urgency"][i])), -5, 5)),
            "importance": int(np.clip(round(float(outputs["importance"][i])), -5, 5)),
        })
    return results


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


@app.on_event("startup")
async def startup_event():
    """服务启动时加载模型"""
    global group_manager
    load_model()
    group_manager = GroupManager()


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
    try:
        result = do_predict(task.title, task.description)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return PredictionOutput(**result)


@app.post("/predict_batch", response_model=BatchOutput)
async def predict_batch(batch: BatchInput):
    try:
        tasks_in = [{"title": t.title, "description": t.description} for t in batch.tasks]
        results = do_predict_batch(tasks_in)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return BatchOutput(tasks=results)


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
        },
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    authenticated = False
    current_group: Optional[Group] = None
    current_nickname: Optional[str] = None

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "")

            # ---- 单机模式：analyze_text / analyze_batch（无需认证）----
            if msg_type == "analyze_text":
                if not data.get("title", "").strip():
                    await ws.send_json({"type": "error", "message": "任务标题不能为空"})
                    continue
                try:
                    result = do_predict(
                        data.get("title", ""),
                        data.get("description", ""),
                    )
                    await ws.send_json({"type": "analyze_result", "task": result})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            if msg_type == "analyze_batch":
                tasks_in = data.get("texts", [])
                if not isinstance(tasks_in, list):
                    await ws.send_json({"type": "error", "message": "texts 字段必须是列表"})
                    continue
                if not tasks_in:
                    await ws.send_json({"type": "error", "message": "任务列表不能为空"})
                    continue
                if len(tasks_in) > 50:
                    await ws.send_json({"type": "error", "message": "单次最多50条"})
                    continue
                try:
                    results = do_predict_batch(tasks_in)
                    await ws.send_json({"type": "analyze_batch_result", "tasks": results})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            # ---- 认证 ----
            if msg_type == "auth":
                # 已认证客户端重新认证：先清理旧组
                if authenticated and current_group and current_nickname:
                    current_group.remove_member(current_nickname)
                    try:
                        await current_group.broadcast({
                            "type": "member_leave",
                            "nickname": current_nickname,
                        })
                    except Exception:
                        pass

                group_id = str(data.get("group_id", "")).strip()
                password = str(data.get("password", "")).strip()
                nickname = str(data.get("nickname", "")).strip()

                if not group_id or not password or not nickname:
                    await ws.send_json({"type": "auth_fail", "reason": "组ID、密码、昵称不能为空"})
                    continue

                try:
                    group = group_manager.get_or_create(group_id, password)
                except ValueError:
                    await ws.send_json({"type": "auth_fail", "reason": "密码错误"})
                    continue

                if group.is_member_online(nickname):
                    await ws.send_json({"type": "auth_fail", "reason": "昵称已被使用，请换一个"})
                    continue

                group.add_member(nickname, ws)
                authenticated = True
                current_group = group
                current_nickname = nickname

                await ws.send_json({
                    "type": "auth_ok",
                    "group_id": group.group_id,
                    "tasks": group.tasks,
                    "members": group.get_members(),
                })
                await group.broadcast({
                    "type": "member_join",
                    "nickname": nickname,
                }, exclude=nickname)
                continue

            # ---- 需要认证的操作 ----
            if not authenticated:
                await ws.send_json({"type": "error", "message": "请先加入协作组"})
                continue

            group = current_group
            nickname = current_nickname

            if msg_type == "task_add":
                title = data.get("title", "").strip()
                description = data.get("description", "").strip()
                if not title:
                    await ws.send_json({"type": "error", "message": "任务标题不能为空"})
                    continue
                try:
                    scored = do_predict(title, description)
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                    continue
                u = scored["urgency"]
                i = scored["importance"]
                task = {
                    "id": f"task_{int(time_module.time() * 1000)}_{len(group.tasks)}",
                    "title": scored["title"],
                    "description": scored["description"],
                    "urgency": u,
                    "importance": i,
                    "quadrant": get_quadrant(u, i),
                    "completed": False,
                    "createdBy": nickname,
                    "createdAt": time_module.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                group.add_task(task)
                group_manager.save_group(group)
                await group.broadcast({"type": "task_added", "task": task})
                continue

            if msg_type == "task_update":
                task_id = data.get("task_id", "")
                curr = next((t for t in group.tasks if t["id"] == task_id), None)
                if not curr:
                    await ws.send_json({"type": "error", "message": "任务不存在"})
                    continue
                updates = {}
                if "urgency" in data:
                    try:
                        updates["urgency"] = int(np.clip(round(data["urgency"]), -5, 5))
                    except (TypeError, ValueError):
                        await ws.send_json({"type": "error", "message": "紧迫度必须是数值"})
                        continue
                if "importance" in data:
                    try:
                        updates["importance"] = int(np.clip(round(data["importance"]), -5, 5))
                    except (TypeError, ValueError):
                        await ws.send_json({"type": "error", "message": "重要性必须是数值"})
                        continue
                u = updates.get("urgency", curr["urgency"])
                i = updates.get("importance", curr["importance"])
                updates["quadrant"] = get_quadrant(u, i)
                updated = group.update_task(task_id, updates)
                if updated:
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_updated", "task": updated})
                else:
                    await ws.send_json({"type": "error", "message": "任务不存在"})
                continue

            if msg_type == "task_delete":
                task_id = data.get("task_id", "")
                if group.delete_task(task_id):
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_deleted", "task_id": task_id})
                else:
                    await ws.send_json({"type": "error", "message": "任务不存在"})
                continue

            if msg_type == "task_toggle":
                task_id = data.get("task_id", "")
                completed = group.toggle_task(task_id)
                if completed is not None:
                    group_manager.save_group(group)
                    await group.broadcast({
                        "type": "task_toggled",
                        "task_id": task_id,
                        "completed": completed,
                    })
                else:
                    await ws.send_json({"type": "error", "message": "任务不存在"})
                continue

            await ws.send_json({"type": "error", "message": f"未知消息类型: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if authenticated and current_group and current_nickname:
            current_group.remove_member(current_nickname)
            try:
                await current_group.broadcast({
                    "type": "member_leave",
                    "nickname": current_nickname,
                })
            except Exception:
                pass


# ============== 主入口 ==============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
