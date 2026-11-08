/**
 * YouTube Live Comment & Chat Manager
 * Controls incoming chat, moderation filter, pinning to video canvas,
 * and test chat simulator.
 */

class CommentManager {
  constructor(overlayManager, onCommentPinned, onCommentDismissed) {
    this.overlayManager = overlayManager;
    this.onCommentPinned = onCommentPinned;
    this.onCommentDismissed = onCommentDismissed;

    this.comments = [];
    this.autoSimInterval = null;
    this.ytPollingInterval = null;
    this.nextPageToken = null;

    // Filter settings
    this.filterBadWords = true;
    this.badWordsList = [
      'អាឆ្កែ', 'មីឆ្កែ', 'អាចុយ', 'មីចុយ', 'អាឆ្គួត', 'មីឆ្គួត', 'spam', 'fuck', 'shit', 'scam'
    ];

    // Sample realistic viewer comments for practice & demonstration
    this.sampleComments = [
      { author: 'Sophea Pich', text: 'សួស្តីបង! រូបភាពច្បាស់ណាស់ ស្បែកម៉ដ្ឋស្អាតណាស់បង 😍' },
      { author: 'Channa Keo', text: 'បង Live ពីភ្នំពេញមែនទេ? វីដេអូល្អមើលខ្លាំងណាស់!' },
      { author: 'Dara Gaming KH', text: 'សម្លេងឮច្បាស់ល្អណាស់បង គ្មានសំឡេងរំខានទេ 🎙️👍' },
      { author: 'Malis Beauty', text: 'តម្រងមុខស្អាតបែបធម្មជាតិណាស់បង! តើបងប្រើកម្មវិធីអ្វីដែរ?' },
      { author: 'Vireak Store', text: 'ABA: 000 123 456 ខ្ញុំបានផ្ញើការគាំទ្រជូនបងហើយ! 🙏' },
      { author: 'Piseth Online', text: 'តើមានលក់ផលិតផលនេះទេបង? តម្លៃប៉ុន្មានដែរ?' },
      { author: 'Bona Tech', text: '1080p 60fps ដើរស្រួលណាស់ មិនទាក់សោះ! 🔥' },
      { author: 'Srey Mao', text: 'ចែករំលែកចូលគ្រុបហើយបង! សូមបន្ត Live យូរៗណា ❤️' },
      { author: 'Alex Walker', text: 'Great stream quality! Love the visual overlays!' },
      { author: 'Rothana Seng', text: 'បងអាចពន្យល់ពីរបៀបកំណត់ Stream Key បន្តិចបានទេ?' }
    ];
  }

  init() {
    this.renderCommentsList();
  }

  addComment(author, text, avatar = '👤', isVerified = false) {
    let cleanText = text;
    if (this.filterBadWords) {
      cleanText = this.moderateText(text);
    }

    const comment = {
      id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      author,
      text: cleanText,
      avatar,
      isVerified,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };

    this.comments.unshift(comment);
    this.renderCommentsList();
    this.updateCountBadge();
    return comment;
  }

  moderateText(text) {
    let result = text;
    for (const badWord of this.badWordsList) {
      const regex = new RegExp(badWord, 'gi');
      result = result.replace(regex, '***');
    }
    return result;
  }

  pinComment(commentId) {
    const comment = this.comments.find(c => c.id === commentId);
    if (!comment) return;

    this.overlayManager.setPinnedComment(comment);
    if (this.onCommentPinned) {
      this.onCommentPinned(comment);
    }
    this.renderCommentsList();
  }

  dismissPinned() {
    this.overlayManager.dismissPinnedComment();
    if (this.onCommentDismissed) {
      this.onCommentDismissed();
    }
    this.renderCommentsList();
  }

  deleteComment(commentId) {
    this.comments = this.comments.filter(c => c.id !== commentId);
    if (this.overlayManager.pinnedComment && this.overlayManager.pinnedComment.id === commentId) {
      this.dismissPinned();
    }
    this.renderCommentsList();
    this.updateCountBadge();
  }

  updateCountBadge() {
    const badge = document.getElementById('chatCountBadge');
    if (badge) {
      badge.textContent = `${this.comments.length} មតិ`;
    }
  }

  simulateOne() {
    const sample = this.sampleComments[Math.floor(Math.random() * this.sampleComments.length)];
    const comment = this.addComment(sample.author, sample.text);
    return comment;
  }

  toggleAutoSimulator() {
    if (this.autoSimInterval) {
      clearInterval(this.autoSimInterval);
      this.autoSimInterval = null;
      return false;
    } else {
      this.simulateOne();
      this.autoSimInterval = setInterval(() => {
        this.simulateOne();
      }, 4000);
      return true;
    }
  }

  /**
   * Connect to YouTube Live Chat API via backend proxy
   */
  async startYouTubeChatPolling(videoId, apiKey, onStatus) {
    if (this.ytPollingInterval) {
      clearInterval(this.ytPollingInterval);
      this.ytPollingInterval = null;
    }

    const poll = async () => {
      try {
        let url = `/api/youtube-chat?videoId=${encodeURIComponent(videoId)}&apiKey=${encodeURIComponent(apiKey)}`;
        if (this.nextPageToken) {
          url += `&pageToken=${encodeURIComponent(this.nextPageToken)}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          if (onStatus) onStatus({ ok: false, error: data.error });
          return;
        }

        this.nextPageToken = data.nextPageToken;

        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            const author = item.authorDetails?.displayName || 'YouTube User';
            const text = item.snippet?.displayMessage || '';
            const avatar = item.authorDetails?.profileImageUrl || '👤';
            this.addComment(author, text, avatar);
          }
        }

        if (onStatus) onStatus({ ok: true, count: data.items?.length || 0 });

      } catch (err) {
        if (onStatus) onStatus({ ok: false, error: err.message });
      }
    };

    await poll();
    this.ytPollingInterval = setInterval(poll, 6000);
  }

  stopYouTubeChatPolling() {
    if (this.ytPollingInterval) {
      clearInterval(this.ytPollingInterval);
      this.ytPollingInterval = null;
    }
  }

  renderCommentsList(searchTerm = '') {
    const listEl = document.getElementById('commentsList');
    const emptyEl = document.getElementById('emptyChatState');
    if (!listEl) return;

    let filtered = this.comments;
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.author.toLowerCase().includes(term) || c.text.toLowerCase().includes(term));
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-chat-state">
          <div class="empty-icon">💬</div>
          <p>${searchTerm ? 'មិនមាន Comment ដែលត្រូវនឹងការស្វែងរកទេ' : 'មិនទាន់មាន Comment នៅឡើយទេ'}</p>
          <small>ចុច "➕ បង្កើត Comment តេស្ត" ឬភ្ជាប់ YouTube ដើម្បីចាប់ផ្តើម</small>
        </div>
      `;
      return;
    }

    const currentPinnedId = this.overlayManager.pinnedComment ? this.overlayManager.pinnedComment.id : null;

    listEl.innerHTML = filtered.map(item => {
      const isPinned = item.id === currentPinnedId;
      return `
        <div class="comment-item ${isPinned ? 'is-pinned' : ''}" data-id="${item.id}">
          <div class="comment-top">
            <div class="comment-user">
              <span class="user-avatar">${typeof item.avatar === 'string' && item.avatar.startsWith('http') ? `<img src="${item.avatar}" style="width:20px;height:20px;border-radius:50%;">` : '👤'}</span>
              <span class="user-name">${this.escapeHtml(item.author)}</span>
            </div>
            <span class="comment-time">${item.time}</span>
          </div>
          <div class="comment-text">${this.escapeHtml(item.text)}</div>
          <div class="comment-actions">
            ${isPinned 
              ? `<button class="btn-pin" onclick="window.commentManager.dismissPinned()">✕ ដកចេញពីអេក្រង់</button>`
              : `<button class="btn-pin" onclick="window.commentManager.pinComment('${item.id}')">📌 បង្ហាញលើអេក្រង់</button>`
            }
            <button class="btn-item-action" onclick="window.commentManager.deleteComment('${item.id}')" title="លុបចោល">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.CommentManager = CommentManager;
