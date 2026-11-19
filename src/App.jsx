import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Activity, Bell, Check, ChevronDown, CircleHelp, Compass, Hash, Image,
  LogOut, MessageCircle, Plus, Search, Send, Settings, Shield, Smile,
  Users, X, Moon, Sun, Pin, Reply, Trash2, Pencil, UserPlus, Server,
  MoreHorizontal
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const EMOJIS = ["❤️", "👍", "😂", "🎉", "👀"];
const initials = (name = "P") => name.trim().slice(0, 1).toUpperCase();

export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState(null);
  const [servers, setServers] = useState([]);
  const [serverId, setServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [channelName, setChannelName] = useState("");
  const [serverName, setServerName] = useState("");
  const [showServerForm, setShowServerForm] = useState(false);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [showFriends, setShowFriends] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadWorkspace();
    else {
      setProfile(null); setServers([]); setChannels([]); setMessages([]);
    }
  }, [session]);

  useEffect(() => {
    if (!channelId || !session) return;
    loadMessages();
    const channel = supabase.channel(`pulsify-messages-${channelId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "messages",
        filter: `channel_id=eq.${channelId}`
      }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelId, session]);

  async function loadWorkspace() {
    const user = session.user;
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!p) {
      const newProfile = { id: user.id, username: user.email?.split("@")[0] || "member", display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Member" };
      const { data } = await supabase.from("profiles").upsert(newProfile).select().single();
      setProfile(data || newProfile);
    } else setProfile(p);
    const { data: memberships, error } = await supabase.from("server_members")
      .select("server_id, servers(*)").eq("user_id", user.id);
    if (error) { setNotice(error.message); return; }
    const list = (memberships || []).map(x => x.servers).filter(Boolean);
    setServers(list);
    const chosen = list.find(s => s.id === serverId) || list[0];
    if (chosen) {
      setServerId(chosen.id);
      await loadChannels(chosen.id);
    } else {
      setChannels([]); setChannelId(null); setMessages([]);
    }
    loadFriends();
  }

  async function loadChannels(id) {
    const { data, error } = await supabase.from("channels").select("*").eq("server_id", id).order("position");
    if (error) { setNotice(error.message); return; }
    setChannels(data || []);
    const selected = (data || []).find(c => c.id === channelId) || (data || [])[0];
    setChannelId(selected?.id || null);
  }

  async function loadMessages() {
    if (!channelId) return;
    const { data, error } = await supabase.from("messages")
      .select("*, profiles:author_id(display_name, username, avatar_url, role)")
      .eq("channel_id", channelId).is("deleted_at", null)
      .order("created_at", { ascending: true }).limit(150);
    if (error) { setNotice(error.message); return; }
    setMessages(data || []);
  }

  async function loadFriends() {
    const { data } = await supabase.from("friendships")
      .select("id, status, requester_id, addressee_id, requester:requester_id(display_name,username), addressee:addressee_id(display_name,username)")
      .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);
    setFriends(data || []);
  }

  async function authenticate(e) {
    e.preventDefault(); setAuthBusy(true); setNotice("");
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { display_name: displayName || email.split("@")[0] } }
        });
        if (error) throw error;
        setNotice("Account created. If email confirmation is enabled, check your inbox, then sign in.");
        setAuthMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) { setNotice(err.message); }
    finally { setAuthBusy(false); }
  }

  async function signOut() { await supabase.auth.signOut(); }

  async function createServer(e) {
    e.preventDefault();
    if (!serverName.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from("servers")
      .insert({ name: serverName.trim(), owner_id: session.user.id }).select().single();
    if (!error) {
      const { error: memberError } = await supabase.from("server_members")
        .insert({ server_id: data.id, user_id: session.user.id, role: "owner" });
      if (memberError) setNotice(memberError.message);
      else {
        await supabase.from("channels").insert({ server_id: data.id, name: "general", type: "text", position: 0 });
        setServerName(""); setShowServerForm(false); await loadWorkspace();
      }
    } else setNotice(error.message);
    setBusy(false);
  }

  async function createChannel(e) {
    e.preventDefault();
    if (!channelName.trim() || !serverId) return;
    const { error } = await supabase.from("channels")
      .insert({ server_id: serverId, name: channelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"), type: "text", position: channels.length });
    if (error) setNotice(error.message);
    else { setChannelName(""); setShowChannelForm(false); await loadChannels(serverId); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !channelId || busy) return;
    setBusy(true);
    const payload = { channel_id: channelId, author_id: session.user.id, content: draft.trim(), reply_to: replyTo?.id || null };
    if (editingId) {
      const { error } = await supabase.from("messages").update({ content: payload.content, edited_at: new Date().toISOString() }).eq("id", editingId);
      if (error) setNotice(error.message);
      setEditingId(null);
    } else {
      const { error } = await supabase.from("messages").insert(payload);
      if (error) setNotice(error.message);
    }
    setDraft(""); setReplyTo(null); setBusy(false); await loadMessages();
  }

  async function removeMessage(id) {
    const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) setNotice(error.message); else loadMessages();
  }

  async function toggleReaction(messageId, emoji) {
    const { data: existing } = await supabase.from("reactions").select("id")
      .eq("message_id", messageId).eq("user_id", session.user.id).eq("emoji", emoji).maybeSingle();
    if (existing) await supabase.from("reactions").delete().eq("id", existing.id);
    else await supabase.from("reactions").insert({ message_id: messageId, user_id: session.user.id, emoji });
    loadMessages();
  }

  async function addFriend(e) {
    e.preventDefault();
    const { data: target, error: findError } = await supabase.from("profiles")
      .select("id").eq("username", friendEmail.trim().replace(/^@/, "")).maybeSingle();
    if (findError || !target) { setNotice("Couldn't find that username. Ask your friend for their Pulsify username."); return; }
    if (target.id === session.user.id) { setNotice("You can't add yourself."); return; }
    const { error } = await supabase.from("friendships").insert({ requester_id: session.user.id, addressee_id: target.id, status: "pending" });
    setNotice(error ? error.message : "Friend request sent.");
    setFriendEmail(""); loadFriends();
  }

  async function updateProfile(e) {
    e.preventDefault();
    const { data, error } = await supabase.from("profiles").upsert({
      id: session.user.id, username: profile?.username || session.user.email.split("@")[0],
      display_name: profileName.trim() || "Member", bio: profileBio.trim()
    }).select().single();
    if (error) setNotice(error.message);
    else { setProfile(data); setShowProfile(false); setNotice("Profile saved."); }
  }

  async function uploadFile(file) {
    if (!file || !channelId) return;
    if (file.size > 8 * 1024 * 1024) { setNotice("Files must be 8 MB or smaller on this starter setup."); return; }
    const safeName = `${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("pulsify-uploads").upload(safeName, file);
    if (error) { setNotice(error.message); return; }
    const { data } = supabase.storage.from("pulsify-uploads").getPublicUrl(safeName);
    const { error: msgError } = await supabase.from("messages").insert({
      channel_id: channelId, author_id: session.user.id, content: file.name,
      attachment_url: data.publicUrl, attachment_name: file.name
    });
    if (msgError) setNotice(msgError.message); else loadMessages();
  }

  const currentServer = servers.find(s => s.id === serverId);
  const currentChannel = channels.find(c => c.id === channelId);
  const visibleMessages = useMemo(() => messages.filter(m => !search || m.content?.toLowerCase().includes(search.toLowerCase())), [messages, search]);

  if (!supabase) return <SetupScreen />;
  if (!session) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark">P</div><div className="eyebrow">YOUR COMMUNITY, YOUR SPACE</div><h1>Welcome to <span>Pulsify</span></h1><p className="muted">Chat, share, and build communities together.</p><form onSubmit={authenticate} className="auth-form">
    {authMode === "signup" && <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="What should people call you?" /></label>}
    <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
    <label>Password<input type="password" minLength="8" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
    <button className="primary wide" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button>
  </form><button className="link-button" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Need an account? Create one":"Already registered? Sign in"}</button>{notice && <div className="notice">{notice}</div>}<p className="tiny muted">Use an account you control. Never share your password or private keys.</p></div></div>;

  return <div className={dark ? "app dark" : "app light"}>
    <aside className="server-rail">
      <div className="rail-logo">P</div><div className="rail-divider"/>
      {servers.map(s=><button key={s.id} title={s.name} className={`server-icon ${serverId===s.id?"selected":""}`} onClick={()=>{setServerId(s.id);loadChannels(s.id);}}>{initials(s.name)}</button>)}
      <button className="server-add" title="Create server" onClick={()=>setShowServerForm(true)}><Plus size={21}/></button>
      <div className="rail-bottom"><button title="Discover communities" onClick={()=>setNotice("Community discovery is coming after public invite links are configured.")}><Compass size={19}/></button></div>
    </aside>

    <aside className="channel-sidebar">
      <div className="server-heading"><div><strong>{currentServer?.name || "Your spaces"}</strong><small>Community workspace</small></div><ChevronDown size={17}/></div>
      <div className="sidebar-scroll">
        <div className="side-section"><div className="section-label">TEXT CHANNELS <button onClick={()=>setShowChannelForm(true)} title="Add channel"><Plus size={15}/></button></div>
          {channels.map(c=><button key={c.id} className={`channel-link ${channelId===c.id?"active":""}`} onClick={()=>setChannelId(c.id)}><Hash size={16}/>{c.name}</button>)}
          {!channels.length && <p className="empty-small">Create a space to get started.</p>}
        </div>
        <button className="side-action" onClick={()=>setShowFriends(!showFriends)}><Users size={17}/> Friends <span>{friends.length}</span></button>
        {showFriends && <div className="friends-panel"><form onSubmit={addFriend}><input value={friendEmail} onChange={e=>setFriendEmail(e.target.value)} placeholder="Pulsify username"/><button className="primary small"><UserPlus size={14}/></button></form>{friends.map(f=>{const other=f.requester_id===session.user.id?f.addressee:f.requester;return <div className="friend-row" key={f.id}><span className="avatar tiny-avatar">{initials(other?.display_name||other?.username)}</span><span>{other?.display_name||other?.username}</span><small>{f.status}</small></div>})}</div>}
      </div>
      <div className="user-panel"><div className="avatar">{initials(profile?.display_name)}</div><div className="user-info"><strong>{profile?.display_name || "Member"}</strong><small>@{profile?.username || "member"} · {profile?.role || "member"}</small></div><button title="Edit profile" onClick={()=>{setProfileName(profile?.display_name||"");setProfileBio(profile?.bio||"");setShowProfile(true);}}><Settings size={17}/></button><button title="Sign out" onClick={signOut}><LogOut size={17}/></button></div>
    </aside>

    <main className="chat-main">
      <header className="topbar"><div className="channel-title"><Hash size={19}/><strong>{currentChannel?.name || "No channel selected"}</strong><span className="top-divider"/><small>{currentServer?.description || "A place to hang out and talk."}</small></div><div className="top-actions"><div className="searchbox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search messages"/></div><button title="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button title="Notifications" onClick={()=>setNotice("Notifications are currently in-app only.")}><Bell size={18}/></button></div></header>
      {!channelId ? <div className="welcome"><div className="welcome-icon"><MessageCircle size={34}/></div><h2>Make Pulsify yours.</h2><p>Create a server, then start a channel and invite your community.</p><button className="primary" onClick={()=>setShowServerForm(true)}><Plus size={16}/> Create your first server</button></div> :
      <>
        <section className="message-list">
          {visibleMessages.length===0 ? <div className="channel-welcome"><div className="hash-large">#</div><h2>Welcome to #{currentChannel?.name}</h2><p>This is the beginning of this channel. Say hello!</p></div> :
            visibleMessages.map(m=><Message key={m.id} message={m} mine={m.author_id===session.user.id} onReply={()=>setReplyTo(m)} onEdit={()=>{setEditingId(m.id);setDraft(m.content);}} onDelete={()=>removeMessage(m.id)} onReact={emoji=>toggleReaction(m.id,emoji)} onPin={()=>setNotice("Pinning requires the pin action to be enabled for your role in the database policies.")}/>)}
          <div className="bottom-anchor"/>
        </section>
        <div className="composer-wrap">
          {replyTo && <div className="reply-banner"><Reply size={14}/> Replying to {replyTo.profiles?.display_name || "member"} <button onClick={()=>setReplyTo(null)}><X size={14}/></button></div>}
          {editingId && <div className="reply-banner">Editing message <button onClick={()=>{setEditingId(null);setDraft("");}}><X size={14}/></button></div>}
          <form className="composer" onSubmit={sendMessage}><label className="attach-button" title="Attach file"><input type="file" accept="image/*,.pdf,.txt" onChange={e=>uploadFile(e.target.files?.[0])}/><Plus size={21}/></label><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={`Message #${currentChannel?.name || "channel"}`} /><button type="button" className="emoji-button" title="Add emoji" onClick={()=>setDraft(d=>d+" 😊")}><Smile size={19}/></button><button className="send-button" disabled={!draft.trim()||busy}><Send size={17}/></button></form><div className="composer-foot">Be kind. Keep your community welcoming.</div>
        </div>
      </>}
    </main>

    {showServerForm && <Modal title="Create a server" onClose={()=>setShowServerForm(false)}><form onSubmit={createServer}><label>Server name<input autoFocus value={serverName} onChange={e=>setServerName(e.target.value)} placeholder="My community" required maxLength="48"/></label><p className="muted tiny">A general text channel will be created automatically.</p><button className="primary wide" disabled={busy}>Create server</button></form></Modal>}
    {showChannelForm && <Modal title="Create a channel" onClose={()=>setShowChannelForm(false)}><form onSubmit={createChannel}><label>Channel name<input autoFocus value={channelName} onChange={e=>setChannelName(e.target.value)} placeholder="announcements" required maxLength="48"/></label><button className="primary wide">Create channel</button></form></Modal>}
    {showProfile && <Modal title="Edit profile" onClose={()=>setShowProfile(false)}><form onSubmit={updateProfile}><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} maxLength="40"/></label><label>About me<textarea value={profileBio} onChange={e=>setProfileBio(e.target.value)} maxLength="240" rows="3"/></label><button className="primary wide">Save profile</button></form></Modal>}
    {notice && <div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
  </div>;
}

function Message({message, mine, onReply, onEdit, onDelete, onReact, onPin}) {
  const [reactions, setReactions] = useState([]);
  useEffect(()=>{supabase.from("reactions").select("emoji,user_id").eq("message_id",message.id).then(({data})=>setReactions(data||[]));},[message.id]);
  const grouped = EMOJIS.map(emoji=>({emoji,count:reactions.filter(r=>r.emoji===emoji).length,selected:reactions.some(r=>r.emoji===emoji)})).filter(x=>x.count);
  return <article className="message-row"><div className="avatar message-avatar">{initials(message.profiles?.display_name||message.profiles?.username)}</div><div className="message-content"><div className="message-meta"><strong>{message.profiles?.display_name||message.profiles?.username||"Member"}</strong>{message.profiles?.role==="admin"&&<span className="role-tag">ADMIN</span>}<time>{new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time>{message.edited_at&&<small>(edited)</small>}</div>{message.reply_to&&<div className="quoted-reply"><Reply size={12}/> Reply</div>}<div className="message-text">{message.attachment_url?<a href={message.attachment_url} target="_blank" rel="noreferrer" className="attachment"><Image size={16}/>{message.attachment_name||message.content}</a>:message.content}</div>{grouped.length>0&&<div className="reactions">{grouped.map(r=><button key={r.emoji} onClick={()=>onReact(r.emoji)} className={r.selected?"reacted":""}>{r.emoji} {r.count}</button>)}</div>}<div className="message-tools">{EMOJIS.map(e=><button key={e} title={`React ${e}`} onClick={()=>onReact(e)}>{e}</button>)}<button title="Reply" onClick={onReply}><Reply size={14}/></button>{mine&&<button title="Edit" onClick={onEdit}><Pencil size={14}/></button>}{mine&&<button title="Delete" onClick={onDelete}><Trash2 size={14}/></button>}<button title="Pin" onClick={onPin}><Pin size={14}/></button></div></div></article>;
}

function Modal({title,children,onClose}) {
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X size={18}/></button></div>{children}</div></div>;
}

function SetupScreen() {
  return <div className="auth-shell"><div className="auth-card"><div className="brand-mark">P</div><h1>Finish setting up <span>Pulsify</span></h1><p className="muted">The website files are installed, but the Supabase connection is missing.</p><ol className="setup-list"><li>In the project folder, rename <code>.env.example</code> to <code>.env</code>.</li><li>Open Supabase → Project Settings → API.</li><li>Copy the Project URL into <code>VITE_SUPABASE_URL</code>.</li><li>Copy the publishable/anon key into <code>VITE_SUPABASE_ANON_KEY</code>.</li><li>Save the file and restart the development server or redeploy.</li></ol><p className="tiny muted">Never put a Supabase service-role key in website code.</p></div></div>;
}
