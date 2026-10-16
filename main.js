import * as C from './config.js';
import { createAdapter } from './DatabaseAdapter.js';
import { AuthService } from './AuthService.js';
import { GalleryService } from './GalleryService.js';
import { RenderEngine } from './RenderEngine.js';

const db = await createAdapter(C.FIREBASE_CONFIG);
const auth = new AuthService(db);
const gallery = new GalleryService(C.PAGE_SIZE);
let liked = new Set(), openId = null, unsubC = null;
try { liked = new Set(JSON.parse(localStorage.getItem('nina_liked') || '[]')); } catch {}
const saveLiked = () => { try { localStorage.setItem('nina_liked', JSON.stringify([...liked])); } catch {} };

const fail = e => ui.toast(e?.code === 'permission-denied' ? 'Not allowed. Only Nina can change artwork.' : (e?.message || 'Something went wrong. Try again.'));
const refresh = () => ui.renderGallery(gallery.visible, gallery.hasMore, gallery.filtered.length, gallery.likes, liked);

const ui = new RenderEngine(C, {
  search: q => { gallery.setQuery(q); refresh(); },
  sort: s => { gallery.setSort(s); refresh(); },
  cat: c => { gallery.setCategory(c); ui.markChip(c); refresh(); },
  more: () => { gallery.loadMore(); refresh(); },
  like: id => {
    const on = !liked.has(id); on ? liked.add(id) : liked.delete(id); saveLiked();
    ui.updateLikes(gallery.likes, liked);
    db.setLike(id, on ? 1 : -1).catch(e => { on ? liked.delete(id) : liked.add(id); saveLiked(); ui.updateLikes(gallery.likes, liked); fail(e); });
  },
  open: id => {
    const a = gallery.byId(id); if (!a) return;
    openId = id; unsubC?.();
    ui.openLightbox(a, gallery.likes, liked);
    unsubC = db.subscribeComments(id, ui.renderComments.bind(ui));
  },
  closed: () => { unsubC?.(); unsubC = null; openId = null; },
  comment: ({ name, text }, form) => {
    if (!openId) return;
    db.addComment({ artwork_id: openId, author_name: name.trim().slice(0, 40), comment_text: text.trim().slice(0, 500) }).then(() => form.reset()).catch(fail);
  },
  admin: () => ui.openAdmin(),
  login: ({ email, password }) => auth.login(email, password).catch(e => ui.toast('Sign-in failed. Check your email and password.')),
  logout: () => auth.logout(),
  edit: id => ui.fillForm(gallery.byId(id)),
  clear: () => ui.fillForm(null),
  remove: id => { if (confirm('Delete this artwork permanently?')) db.deleteArtwork(id).then(() => ui.toast('Deleted.')).catch(fail); },
  save: d => {
    const art = { title: d.title.trim(), imageUrl: d.imageUrl.trim(), category: d.category, description: d.description.trim(),
      tags: d.tags.split(',').map(t => t.trim()).filter(Boolean), featured: d.featured };
    (d.id ? db.updateArtwork(d.id, art) : db.addArtwork(art)).then(() => { ui.fillForm(null); ui.toast('Saved.'); }).catch(fail);
  },
  copy: () => ui.copySummary()
});

auth.onChange(u => ui.renderAuth(u));
db.subscribeArtworks(list => { gallery.setArtworks(list); ui.renderHero(gallery.hero); ui.renderAdminList(list); refresh(); });
db.subscribeLikes(l => { gallery.setLikes(l); ui.updateLikes(l, liked); if (gallery.sort === 'liked') refresh(); });
