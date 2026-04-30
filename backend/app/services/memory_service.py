from typing import List, Dict

# simple in-memory store (later DB use করবো)
_memory_store: Dict[str, List[dict]] = {}


def get_user_memory(user_id: str) -> List[dict]:
    return _memory_store.get(user_id, [])


def save_user_memory(user_id: str, message: dict):
    if user_id not in _memory_store:
        _memory_store[user_id] = []

    _memory_store[user_id].append(message)

    # keep last 20 messages only
    _memory_store[user_id] = _memory_store[user_id][-20:]