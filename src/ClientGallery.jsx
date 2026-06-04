/**
 * ClientGallery — public before/after gallery page + upload form
 * Route: /gallery
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from './useSEO';
import './ClientGallery.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const CLOUDINARY   = 'https://api.cloudinary.com/v1_1/djjxu9yg9/image/upload';
const PRESET       = 'NXLBEAUTYBAR';

export default function ClientGallery() {
  useSEO({
    title:       'Nail Gallery — Before & After Photos | NXL Beauty Bar',
    description: 'Browse real before & after nail transformation photos from NXL Beauty Bar clients. Acrylic nails, gel polish, nail art and more in Soweto.',
    url:         '/gallery',
  });

  const [posts,      setPosts]      = useState([]);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [liked,      setLiked]      = useState(() => {
    try { return JSON.parse(localStorage.getItem('nxl_liked_posts') || '[]'); } catch { return []; }
  });

  // Upload state
  const [afterFile,    setAfterFile]    = useState(null);
  const [beforeFile,   setBeforeFile]   = useState(null);
  const [afterPreview, setAfterPreview] = useState('');
  const [beforePreview,setBeforePreview]= useState('');
  const [caption,      setCaption]      = useState('');
  const [rating,       setRating]       = useState(5);
  const [uploading,    setUploading]    = useState(false);
  const [uploadSuccess,setUploadSuccess]= useState(false);
  const [uploadError,  setUploadError]  = useState('');

  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => { loadPosts(page); }, [page]);

  const loadPosts = async (p = 1) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/client-gallery/public?page=${p}&limit=12`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.data || []);
        setTotalPages(data.pages || 1);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const uploadToCloudinary = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', PRESET);
    const res  = await fetch(CLOUDINARY, { method:'POST', body:fd });
    const data = await res.json();
    if (!data.secure_url) throw new Error('Upload failed');
    return data.secure_url;
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'after')  { setAfterFile(file);  setAfterPreview(url); }
    else                   { setBeforeFile(file); setBeforePreview(url); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!afterFile) { setUploadError('Please select an after photo.'); return; }
    setUploading(true); setUploadError('');
    try {
      const [afterUrl, beforeUrl] = await Promise.all([
        uploadToCloudinary(afterFile),
        beforeFile ? uploadToCloudinary(beforeFile) : Promise.resolve(null),
      ]);

      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/client-gallery`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
        body: JSON.stringify({ afterImageUrl:afterUrl, beforeImageUrl:beforeUrl, caption, rating }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Submission failed');
      setUploadSuccess(true);
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); }
  };

  const handleLike = async (postId) => {
    if (liked.includes(postId)) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/client-gallery/${postId}/like`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } });
      const newLiked = [...liked, postId];
      setLiked(newLiked);
      localStorage.setItem('nxl_liked_posts', JSON.stringify(newLiked));
      setPosts(prev => prev.map(p => p._id === postId ? {...p, likes:(p.likes||0)+1} : p));
    } catch {}
  };

  return (
    <div className="cg-root">
      <div className="cg-inner">

        {/* Header */}
        <div className="cg-header">
          <Link to="/" className="cg-back">← Home</Link>
          <h1 className="cg-title">Client Gallery ✨</h1>
          <p className="cg-subtitle">Real transformations by NXL Beauty Bar — Dube, Soweto</p>
          {isLoggedIn && !showUpload && (
            <button className="cg-upload-btn" onClick={() => setShowUpload(true)}>
              📸 Share Your Look
            </button>
          )}
          {!isLoggedIn && (
            <p className="cg-login-note">
              <Link to="/login">Sign in</Link> to share your before & after photos!
            </p>
          )}
        </div>

        {/* Upload form */}
        {showUpload && !uploadSuccess && (
          <div className="cg-upload-card">
            <div className="cg-upload-header">
              <h2>Share Your Transformation 💅</h2>
              <button className="cg-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="cg-upload-form">
              <div className="cg-upload-row">
                {/* After photo — required */}
                <div className="cg-upload-zone" onClick={() => document.getElementById('after-input').click()}>
                  {afterPreview
                    ? <img src={afterPreview} alt="After" className="cg-preview-img" />
                    : <div className="cg-upload-placeholder"><span>📸</span><p>After Photo *</p><small>Click to upload</small></div>
                  }
                  <input id="after-input" type="file" accept="image/*" onChange={e => handleFileChange(e,'after')} style={{display:'none'}} />
                </div>
                {/* Before photo — optional */}
                <div className="cg-upload-zone optional" onClick={() => document.getElementById('before-input').click()}>
                  {beforePreview
                    ? <img src={beforePreview} alt="Before" className="cg-preview-img" />
                    : <div className="cg-upload-placeholder"><span>🖼️</span><p>Before Photo</p><small>Optional</small></div>
                  }
                  <input id="before-input" type="file" accept="image/*" onChange={e => handleFileChange(e,'before')} style={{display:'none'}} />
                </div>
              </div>

              <textarea className="cg-caption-input" placeholder="Add a caption… (e.g. Got my acrylics done for my birthday! 🎂)" value={caption} onChange={e => setCaption(e.target.value)} rows={3} maxLength={200} />

              <div className="cg-rating-row">
                <span className="cg-rating-label">Rate your experience:</span>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" className={`cg-star ${n <= rating ? 'filled' : ''}`} onClick={() => setRating(n)}>★</button>
                ))}
              </div>

              {uploadError && <p className="cg-error">{uploadError}</p>}

              <p className="cg-moderation-note">📋 Your photo will be reviewed by our team before appearing in the gallery.</p>

              <div className="cg-form-actions">
                <button type="button" className="cg-btn-outline" onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="cg-btn-gold" disabled={uploading}>
                  {uploading ? 'Uploading…' : '✅ Submit Photo'}
                </button>
              </div>
            </form>
          </div>
        )}

        {uploadSuccess && (
          <div className="cg-upload-success">
            <span className="cg-success-icon">🎉</span>
            <h2>Thanks for sharing!</h2>
            <p>Your photo is being reviewed and will appear in the gallery shortly.</p>
            <button className="cg-btn-gold" onClick={() => { setUploadSuccess(false); setShowUpload(false); setAfterFile(null); setBeforeFile(null); setAfterPreview(''); setBeforePreview(''); setCaption(''); setRating(5); }}>
              Share Another
            </button>
          </div>
        )}

        {/* Gallery grid */}
        {loading ? (
          <div className="cg-loading">
            {Array.from({length:6}).map((_,i) => <div key={i} className="cg-skeleton" />)}
          </div>
        ) : (
          <>
            {!posts.length && (
              <div className="cg-empty">
                <span>✨</span>
                <p>No photos yet — be the first to share your transformation!</p>
              </div>
            )}
            <div className="cg-grid">
              {posts.map(post => (
                <div key={post._id} className="cg-card">
                  {/* Before/after toggle */}
                  {post.beforeImageUrl ? (
                    <BeforeAfterCard post={post} />
                  ) : (
                    <div className="cg-img-wrap">
                      <img src={post.afterImageUrl} alt={post.caption || 'Nail transformation'} className="cg-img" loading="lazy" />
                    </div>
                  )}
                  <div className="cg-card-body">
                    {post.clientName && <p className="cg-client">{post.clientName}</p>}
                    {post.caption    && <p className="cg-caption">{post.caption}</p>}
                    {post.serviceNames?.length > 0 && (
                      <div className="cg-tags">
                        {post.serviceNames.map((s,i) => <span key={i} className="cg-tag">{s}</span>)}
                      </div>
                    )}
                    {post.rating && <div className="cg-stars">{'★'.repeat(post.rating)}{'☆'.repeat(5-post.rating)}</div>}
                    <div className="cg-card-footer">
                      <button className={`cg-like-btn ${liked.includes(post._id)?'liked':''}`} onClick={() => handleLike(post._id)}>
                        {liked.includes(post._id) ? '❤️' : '🤍'} {post.likes || 0}
                      </button>
                      <span className="cg-date">{new Date(post.createdAt).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="cg-pagination">
                <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="cg-page-btn">‹ Prev</button>
                <span className="cg-page-info">Page {page} of {totalPages}</span>
                <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)} className="cg-page-btn">Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Before/after slider card
function BeforeAfterCard({ post }) {
  const [showAfter, setShowAfter] = useState(true);
  return (
    <div className="cg-ba-wrap">
      <img src={showAfter ? post.afterImageUrl : post.beforeImageUrl} alt={showAfter ? 'After' : 'Before'} className="cg-img" loading="lazy" />
      <div className="cg-ba-toggle">
        <button className={!showAfter?'active':''} onClick={() => setShowAfter(false)}>Before</button>
        <button className={showAfter?'active':''} onClick={() => setShowAfter(true)}>After</button>
      </div>
    </div>
  );
}