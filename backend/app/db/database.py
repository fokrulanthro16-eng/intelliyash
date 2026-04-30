"""Async SQLite layer using SQLAlchemy. Stores chats, messages, settings, memory."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

from app.config import settings


def _sqlite_url() -> str:
    return f"sqlite+aiosqlite:///{settings.db_path}"


class Base(DeclarativeBase):
    pass


# ---------------- CHAT ----------------
class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False, default="New chat")
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    messages = relationship(
        "Message",
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="Message.id",
    )


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    model_id = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    chat = relationship("Chat", back_populates="messages")


# ---------------- MEMORY (NEW) ----------------
class Memory(Base):
    __tablename__ = "memory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(50), index=True)
    role = Column(String(16))
    content = Column(Text)
    created_at = Column(DateTime, default=dt.datetime.utcnow)


# ---------------- SETTINGS ----------------
class SettingKV(Base):
    __tablename__ = "settings_kv"
    key = Column(String(80), primary_key=True)
    value = Column(Text, nullable=True)


# ---------------- ENGINE ----------------
_engine = create_async_engine(_sqlite_url(), echo=False, future=True)
_Session = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def get_session() -> AsyncSession:
    return _Session()


# ---------------- CHAT HELPERS ----------------
async def create_chat(title: str = "New chat") -> int:
    async with get_session() as s:
        chat = Chat(title=title)
        s.add(chat)
        await s.commit()
        return chat.id


async def add_message(
    chat_id: int, role: str, content: str, model_id: Optional[str] = None
) -> int:
    async with get_session() as s:
        msg = Message(chat_id=chat_id, role=role, content=content, model_id=model_id)
        s.add(msg)
        await s.commit()
        return msg.id


async def list_chats() -> list[dict]:
    async with get_session() as s:
        rows = (await s.execute(select(Chat).order_by(Chat.created_at.desc()))).scalars().all()
        return [
            {"id": r.id, "title": r.title, "created_at": r.created_at.isoformat()}
            for r in rows
        ]


async def get_chat_messages(chat_id: int) -> list[dict]:
    async with get_session() as s:
        rows = (
            await s.execute(
                select(Message).where(Message.chat_id == chat_id).order_by(Message.id)
            )
        ).scalars().all()
        return [
            {
                "id": r.id,
                "role": r.role,
                "content": r.content,
                "model_id": r.model_id,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]


async def delete_chat(chat_id: int) -> None:
    async with get_session() as s:
        chat = await s.get(Chat, chat_id)
        if chat:
            await s.delete(chat)
            await s.commit()


# ---------------- MEMORY HELPERS (NEW) ----------------
async def get_memory(user_id: str) -> list[dict]:
    async with get_session() as s:
        rows = (
            await s.execute(
                select(Memory)
                .where(Memory.user_id == user_id)
                .order_by(Memory.id)
                .limit(20)
            )
        ).scalars().all()

        return [{"role": r.role, "content": r.content} for r in rows]


async def save_memory(user_id: str, messages: list[dict]) -> None:
    async with get_session() as s:
        for msg in messages:
            s.add(
                Memory(
                    user_id=user_id,
                    role=msg["role"],
                    content=msg["content"],
                )
            )
        await s.commit()


# ---------------- SETTINGS ----------------
async def get_setting(key: str) -> Optional[str]:
    async with get_session() as s:
        row = await s.get(SettingKV, key)
        return row.value if row else None


async def set_setting(key: str, value: Optional[str]) -> None:
    async with get_session() as s:
        row = await s.get(SettingKV, key)
        if row is None:
            s.add(SettingKV(key=key, value=value))
        else:
            row.value = value
        await s.commit()