import React, { useEffect, useState } from 'react'
const API = 'http://127.0.0.1:9100'
interface Post { id: number; title: string; content: string; author: string }
export default function App() {
  const [posts, setPosts] = useState<Post[]>([])
  const [title, setTitle] = useState(''); const [content, setContent] = useState('')
  useEffect(() => { load() }, [])
  async function load() { const r = await fetch(API+'/posts'); const d = await r.json(); setPosts(d.posts) }
  async function add() {
    if (!title.trim()) return
    await fetch(API+'/posts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title, content, author:'Me'}) })
    setTitle(''); setContent(''); load()
  }
  return (
    <div style={{fontFamily:'Arial',maxWidth:720,margin:'40px auto',padding:'0 20px'}}>
      <h1>Blog</h1>
      <div style={{marginBottom:24,padding:16,background:'#f9fafb',borderRadius:8}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Post title" style={{display:'block',width:'100%',marginBottom:8,padding:8,border:'1px solid #ddd',borderRadius:6}}/>
        <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Content..." rows={3} style={{display:'block',width:'100%',marginBottom:8,padding:8,border:'1px solid #ddd',borderRadius:6}}/>
        <button onClick={add} style={{padding:'8px 16px',background:'#4f46e5',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Publish</button>
      </div>
      {posts.map(p=>(
        <div key={p.id} style={{marginBottom:16,padding:16,background:'white',border:'1px solid #e5e7eb',borderRadius:8}}>
          <h2 style={{margin:'0 0 4px'}}>{p.title}</h2>
          <div style={{fontSize:12,color:'#9ca3af',marginBottom:8}}>by {p.author}</div>
          <p style={{margin:0}}>{p.content}</p>
        </div>
      ))}
    </div>
  )
}
