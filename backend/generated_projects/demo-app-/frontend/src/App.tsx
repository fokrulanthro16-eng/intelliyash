import React, { useEffect, useState } from 'react'

const API = 'http://127.0.0.1:9100'

interface Todo { id: number; title: string; done: boolean }

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [input, setInput] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch(API + '/todos')
    const data = await res.json()
    setTodos(data.todos)
  }

  async function add() {
    if (!input.trim()) return
    await fetch(API + '/todos?title=' + encodeURIComponent(input), { method: 'POST' })
    setInput(''); load()
  }

  async function toggle(id: number) {
    await fetch(API + '/todos/' + id, { method: 'PUT' }); load()
  }

  async function del(id: number) {
    await fetch(API + '/todos/' + id, { method: 'DELETE' }); load()
  }

  return (
    <div style={{ fontFamily: 'Arial', maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
      <h1>Todo App</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add a todo..."
          style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button onClick={add}
          style={{ padding: '8px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Add
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map(t => (
          <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, marginBottom: 8, background: '#f9fafb', borderRadius: 8 }}>
            <span onClick={() => toggle(t.id)}
              style={{ flex: 1, cursor: 'pointer', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.5 : 1 }}>
              {t.title}
            </span>
            <button onClick={() => del(t.id)}
              style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
