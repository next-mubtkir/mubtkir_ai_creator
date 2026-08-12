frappe.pages['ai-creator-chat'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: 'Mubtkir AI Creator', single_column: true });
	$(wrapper).find('.page-head').hide();
	new AICreatorApp(page);
};

/* ═══════════════════ Brand Theme ═══════════════════ */
const THEME = `
:root {
	--mc-primary: #3867AE; --mc-secondary: #0F84B5; --mc-accent: #0BA1B8;
	--mc-purple: #644DA6; --mc-text: #243B63; --mc-border: rgba(56,103,174,.22);
	--mc-soft: rgba(56,103,174,.07); --mc-user-bg: #3867AE; --mc-bot-bg: #f0f4f8;
	--mc-sidebar-bg: #fafbfd;
}
.dark-theme {
	--mc-soft: rgba(56,103,174,.15); --mc-bot-bg: #1e293b; --mc-sidebar-bg: #0f172a;
	--mc-text: #e2e8f0;
}
.mc-app{font-family:Inter,-apple-system,sans-serif;color:var(--mc-text);height:calc(100vh - 60px);display:flex;direction:rtl}
.mc-sidebar{width:280px;min-width:240px;border-inline-start:1px solid var(--mc-border);background:var(--mc-sidebar-bg);display:flex;flex-direction:column;overflow:hidden}
.mc-info{width:260px;min-width:220px;border-inline-end:1px solid var(--mc-border);background:var(--mc-sidebar-bg);overflow-y:auto;padding:16px}
.mc-center{flex:1;display:flex;flex-direction:column;min-width:0}
.mc-header{padding:12px 16px;border-bottom:1px solid var(--mc-border);display:flex;align-items:center;gap:10px}
.mc-header-title{font-weight:700;font-size:15px;flex:1}
.mc-header .indicator{width:8px;height:8px;border-radius:50%;display:inline-block}
.mc-header .indicator.green{background:#22c55e}.mc-header .indicator.red{background:#ef4444}.mc-header .indicator.grey{background:#94a3b8}
.mc-tabs{display:flex;gap:4px;padding:6px 12px;border-bottom:1px solid var(--mc-border);overflow-x:auto;flex-shrink:0}
.mc-tab{padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer;white-space:nowrap;border:1px solid var(--mc-border);display:flex;align-items:center;gap:6px}
.mc-tab.active{background:var(--mc-primary);color:#fff;border-color:var(--mc-primary)}
.mc-tab .close{font-size:10px;cursor:pointer;opacity:.6}.mc-tab .close:hover{opacity:1}
.mc-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.mc-pinned{background:var(--mc-soft);border:1px solid var(--mc-border);border-radius:8px;padding:8px 12px;font-size:12px;display:none;position:relative}
.mc-pinned .unpin{position:absolute;top:4px;left:4px;cursor:pointer;font-size:10px}
.mc-bubble{max-width:78%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;white-space:pre-wrap;position:relative;word-break:break-word}
.mc-bubble.user{background:var(--mc-user-bg);color:#fff;align-self:flex-start;border-bottom-right-radius:4px}
.mc-bubble.bot{background:var(--mc-bot-bg);align-self:flex-end;border-bottom-left-radius:4px}
.mc-bubble.system{background:transparent;color:#94a3b8;font-size:12px;text-align:center;align-self:center}
.mc-bubble.error{background:#fef2f2;border:1px solid #fca5a5}
.mc-bubble-actions{display:none;gap:4px;margin-top:6px}.mc-bubble:hover .mc-bubble-actions{display:flex}
.mc-bubble-actions button{font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid var(--mc-border);background:#fff;cursor:pointer}
.mc-typing{align-self:flex-end;padding:10px 18px;background:var(--mc-bot-bg);border-radius:12px;display:none}
.mc-typing span{display:inline-block;width:8px;height:8px;background:var(--mc-secondary);border-radius:50%;margin:0 2px;animation:bounce .6s infinite alternate}
.mc-typing span:nth-child(2){animation-delay:.2s}.mc-typing span:nth-child(3){animation-delay:.4s}
@keyframes bounce{to{transform:translateY(-6px);opacity:.4}}
.mc-input-area{padding:10px 16px;border-top:1px solid var(--mc-border);display:flex;gap:8px;align-items:flex-end}
.mc-input-area textarea{flex:1;resize:none;border:1px solid var(--mc-border);border-radius:12px;padding:10px 14px;font-size:14px;max-height:120px;min-height:42px}
.mc-input-area button{width:38px;height:38px;border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px}
.mc-btn-send{background:var(--mc-primary);color:#fff}.mc-btn-send:hover{background:var(--mc-secondary)}
.mc-btn-tool{background:var(--mc-soft);color:var(--mc-text)}.mc-btn-tool:hover{background:var(--mc-border)}
.mc-btn-tool.recording{background:#ef4444;color:#fff}
.mc-reply-preview{background:var(--mc-soft);border-right:3px solid var(--mc-primary);padding:6px 12px;margin-bottom:6px;border-radius:4px;font-size:12px;display:none;position:relative}
.mc-reply-preview .dismiss{position:absolute;top:2px;left:6px;cursor:pointer}
.mc-attach-chips{display:flex;flex-wrap:wrap;gap:4px;padding:0 16px}
.mc-attach-chip{font-size:11px;padding:3px 8px;border:1px solid var(--mc-border);border-radius:12px;display:flex;align-items:center;gap:4px}
.mc-type-picker{display:flex;flex-direction:column;gap:8px;padding:20px;align-items:center}
.mc-type-picker h4{color:var(--mc-text);margin-bottom:8px}
.mc-type-btn{width:100%;max-width:300px;padding:10px;border:1px solid var(--mc-border);border-radius:8px;cursor:pointer;text-align:center;font-size:13px;transition:all .15s}
.mc-type-btn:hover{background:var(--mc-primary);color:#fff;border-color:var(--mc-primary)}
.mc-conv-item{padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--mc-border);transition:background .1s}
.mc-conv-item:hover{background:var(--mc-soft)}
.mc-conv-item .name{font-weight:600;font-size:13px;display:flex;justify-content:space-between}
.mc-conv-item .preview{font-size:11px;color:#94a3b8;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-conv-item .meta{font-size:10px;color:#94a3b8;margin-top:2px;display:flex;gap:8px}
.mc-info h5{font-size:12px;font-weight:700;color:var(--mc-secondary);margin:12px 0 6px;text-transform:uppercase}
.mc-info .row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--mc-soft)}
.mc-info .row .val{font-weight:600}
.mc-search{width:100%;padding:8px 12px;border:none;border-bottom:1px solid var(--mc-border);font-size:13px;outline:none;background:transparent}
.mc-filter-chip{padding:3px 8px;border-radius:10px;font-size:11px;cursor:pointer;white-space:nowrap;border:1px solid var(--mc-border);color:var(--mc-text)}
.mc-filter-chip.active{background:var(--mc-primary);color:#fff;border-color:var(--mc-primary)}
.mc-filter-chip:hover:not(.active){background:var(--mc-soft)}
.mc-mute-btn{position:absolute;bottom:50px;left:8px;font-size:11px;padding:3px 8px;border-radius:10px;border:1px solid var(--mc-border);background:#fff;cursor:pointer}
@media(max-width:768px){.mc-sidebar,.mc-info{display:none}.mc-sidebar.mobile-show,.mc-info.mobile-show{display:flex;position:fixed;top:0;right:0;bottom:0;z-index:1050;width:85vw;box-shadow:-4px 0 20px rgba(0,0,0,.2)}}
`;

const REQUEST_TYPES = [
	'Support Request', 'Custom Field / Print Format', 'Report / Data Query',
	'Import / Export', 'Settings Change', 'Client Script', 'Server Script',
	'Print Format Design', 'Other',
];

const TYPE_ICONS = {
	'Support Request': '🛠️', 'Custom Field / Print Format': '📝', 'Report / Data Query': '📊',
	'Import / Export': '📥', 'Settings Change': '⚙️', 'Client Script': '💻',
	'Server Script': '🖥️', 'Print Format Design': '🖨️', 'Other': '📋',
};

/* notification sound (base64 tiny beep) */
const NOTIF_SOUND = (() => {
	try {
		const ctx = new (window.AudioContext || window.webkitAudioContext)();
		return () => { const o = ctx.createOscillator(); o.frequency.value = 880; o.type = 'sine'; const g = ctx.createGain(); g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.12); };
	} catch (e) { return () => {}; }
})();

/* ═══════════════════ App Shell ═══════════════════ */
class AICreatorApp {
	constructor(page) {
		this.page = page;
		this.tabs = [];
		this.activeId = null;
		this.nextId = 1;
		this.soundEnabled = true;
		this.init();
	}

	init() {
		if (!document.getElementById('mc-theme')) {
			const s = document.createElement('style'); s.id = 'mc-theme'; s.textContent = THEME; document.head.appendChild(s);
		}
		if (document.body.classList.contains('dark')) document.documentElement.classList.add('dark-theme');

		this.page.main.html(`
			<div class="mc-app">
				<div class="mc-sidebar" id="mc-sidebar">
					<div style="padding:12px;font-weight:700;font-size:16px;color:var(--mc-primary);border-bottom:1px solid var(--mc-border);display:flex;justify-content:space-between;align-items:center">
						Mubtkir AI Creator
						<button class="mc-btn-tool mc-mobile-close-sidebar" style="display:none;width:28px;height:28px;font-size:12px">✕</button>
					</div>
					<input class="mc-search" placeholder="Search conversations..." id="mc-conv-search"/>
					<div id="mc-type-filter" style="display:flex;gap:4px;padding:6px 8px;overflow-x:auto;flex-shrink:0;border-bottom:1px solid var(--mc-border)">
						<span class="mc-filter-chip active" data-type="">All</span>
					</div>
					<div id="mc-conv-list" style="flex:1;overflow-y:auto"></div>
					<div id="mc-show-more" style="padding:6px;text-align:center;display:none">
						<button style="width:100%;padding:6px;border:1px solid var(--mc-border);border-radius:6px;background:transparent;cursor:pointer;font-size:12px;color:var(--mc-secondary)">Show more...</button>
					</div>
					<div style="padding:8px;border-top:1px solid var(--mc-border);position:relative">
						<button id="mc-new-session" style="width:100%;padding:8px;border-radius:8px;background:var(--mc-primary);color:#fff;border:none;cursor:pointer;font-size:13px">+ New Session</button>
						<button class="mc-mute-btn" id="mc-mute-btn" title="Toggle sound">🔔</button>
					</div>
				</div>
				<div class="mc-center">
					<div class="mc-tabs" id="mc-tabbar"></div>
					<div id="mc-panels" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
				</div>
				<div class="mc-info" id="mc-info"></div>
			</div>
			<button class="mc-btn-tool" id="mc-mobile-sidebar-btn" style="display:none;position:fixed;bottom:16px;right:16px;z-index:1040;width:48px;height:48px;font-size:20px;box-shadow:0 2px 12px rgba(0,0,0,.2)">☰</button>
		`);

		this.$tabbar = this.page.main.find('#mc-tabbar');
		this.$panels = this.page.main.find('#mc-panels');
		this.$sidebar = this.page.main.find('#mc-sidebar');
		this.$info = this.page.main.find('#mc-info');
		this.$convList = this.page.main.find('#mc-conv-list');
		this.$convSearch = this.page.main.find('#mc-conv-search');

		this.page.main.find('#mc-new-session').on('click', () => this.newTab());
		this.$convSearch.on('input', frappe.utils.debounce(() => this.loadConversations(), 300));

		// Mobile
		this.page.main.find('#mc-mobile-sidebar-btn').on('click', () => this.$sidebar.toggleClass('mobile-show'));
		this.page.main.find('.mc-mobile-close-sidebar').on('click', () => this.$sidebar.removeClass('mobile-show'));
		if (window.innerWidth <= 768) {
			this.page.main.find('#mc-mobile-sidebar-btn, .mc-mobile-close-sidebar').show();
		}

		this.convPage = 0;
		this.convFilter = '';
		this.buildFilterChips();

		this.page.main.find('#mc-mute-btn').on('click', () => {
			this.soundEnabled = !this.soundEnabled;
			this.page.main.find('#mc-mute-btn').text(this.soundEnabled ? '🔔' : '🔇').attr('title', this.soundEnabled ? 'Sound on' : 'Sound off');
		});

		this.page.main.find('#mc-show-more button').on('click', () => { this.convPage++; this.loadConversations(true); });

		this.loadConversations();
		this.newTab();
	}

	buildFilterChips() {
		const $bar = this.page.main.find('#mc-type-filter');
		$bar.empty();
		const $all = $('<span class="mc-filter-chip active" data-type="">All</span>');
		$all.on('click', () => { this.convFilter = ''; this.convPage = 0; $bar.find('.mc-filter-chip').removeClass('active'); $all.addClass('active'); this.loadConversations(); });
		$bar.append($all);
		REQUEST_TYPES.forEach((t) => {
			const icon = TYPE_ICONS[t] || '📋';
			const $chip = $(`<span class="mc-filter-chip" data-type="${t}">${icon}</span>`);
			$chip.attr('title', t);
			$chip.on('click', () => { this.convFilter = t; this.convPage = 0; $bar.find('.mc-filter-chip').removeClass('active'); $chip.addClass('active'); this.loadConversations(); });
			$bar.append($chip);
		});
	}

	async loadConversations(append) {
		const search = (this.$convSearch.val() || '').trim();
		const r = await frappe.call('mubtkir_ai_creator.api.list_recent_sessions', { search: search || null, limit: 20 });
		const rows = r.message || [];
		this.$convList.empty();

		if (!rows.length) {
			this.$convList.html('<div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">No previous conversations</div>');
			return;
		}

		rows.forEach((row) => {
			const icon = TYPE_ICONS[row.request_type] || '💬';
			const statusDot = row.status === 'Open' ? '🟢' : '⚪';
			const $item = $(`
				<div class="mc-conv-item">
					<div class="name"><span>${icon} ${frappe.utils.escape_html(row.client_site || '')}</span><span>${statusDot}</span></div>
					<div class="preview">${frappe.utils.escape_html(row.last_message || row.title || '')}</div>
					<div class="meta"><span>${row.request_type || ''}</span><span>${row.message_count || 0} msgs</span><span>${frappe.datetime.comment_when(row.modified)}</span></div>
				</div>
			`);
			$item.on('click', () => { this.$sidebar.removeClass('mobile-show'); this.resumeSession(row); });
			this.$convList.append($item);
		});
	}

	renderTabbar() {
		this.$tabbar.empty();
		this.tabs.forEach((tab) => {
			const active = tab.id === this.activeId;
			const $t = $(`<div class="mc-tab ${active ? 'active' : ''}"><span>${frappe.utils.escape_html(tab.title || 'New')}</span><span class="close">✕</span></div>`);
			$t.on('click', (e) => { if (!$(e.target).hasClass('close')) this.switchTab(tab.id); });
			$t.find('.close').on('click', (e) => { e.stopPropagation(); this.closeTab(tab.id); });
			this.$tabbar.append($t);
		});
	}

	newTab() {
		const id = this.nextId++;
		const $panel = $('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');
		this.$panels.append($panel);
		const tab = { id, title: 'New', panel: $panel, chat: null };
		tab.chat = new ChatPanel($panel, this, {
			onTitle: (t) => { tab.title = t; this.renderTabbar(); },
		});
		this.tabs.push(tab);
		this.switchTab(id);
	}

	switchTab(id) {
		this.activeId = id;
		this.tabs.forEach((t) => t.panel.toggle(t.id === id));
		this.renderTabbar();
		const tab = this.tabs.find((t) => t.id === id);
		if (tab && tab.chat) tab.chat.refreshInfo();
	}

	closeTab(id) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) return;
		const finish = () => {
			tab.panel.remove();
			this.tabs = this.tabs.filter((t) => t.id !== id);
			if (this.activeId === id) { this.tabs.length ? this.switchTab(this.tabs[this.tabs.length - 1].id) : this.newTab(); }
			else this.renderTabbar();
		};
		if (tab.chat && tab.chat.session && tab.chat.sessionStatus === 'Open') {
			frappe.call('mubtkir_ai_creator.api.close_session', { session: tab.chat.session }).always(finish);
		} else finish();
	}

	async resumeSession(row) {
		const existing = this.tabs.find((t) => t.chat && t.chat.session === row.name);
		if (existing) { this.switchTab(existing.id); return; }
		const id = this.nextId++;
		const $panel = $('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');
		this.$panels.append($panel);
		const tab = { id, title: row.client_site || row.name, panel: $panel, chat: null };
		tab.chat = new ChatPanel($panel, this, { onTitle: (t) => { tab.title = t; this.renderTabbar(); } });
		this.tabs.push(tab);
		this.switchTab(id);
		await tab.chat.resume(row.name, row.client_site, row.title, row.status, row.request_type);
	}

	updateInfo(html) { this.$info.html(html); }
}

/* ═══════════════════ Chat Panel ═══════════════════ */
class ChatPanel {
	constructor($el, app, hooks) {
		this.$el = $el; this.app = app; this.hooks = hooks || {};
		this.session = null; this.sessionStatus = null; this.clientSite = null; this.requestType = null;
		this.pendingFiles = []; this.replyTo = null; this.pinnedMsg = null; this.recognition = null;
		this.render(); this.loadClients(); this.setupMic();
	}

	render() {
		this.$el.html(`
			<div class="mc-header">
				<span class="indicator grey"></span>
				<span class="mc-header-title">Select a client to start</span>
				<div class="mc-client-wrap" style="max-width:240px;flex:1"></div>
				<button class="mc-start-btn mc-btn-tool" style="border-radius:8px;width:auto;padding:6px 14px;font-size:12px">Start Session</button>
				<button class="mc-end-btn mc-btn-tool" style="border-radius:8px;width:auto;padding:6px 14px;font-size:12px;display:none">End Session</button>
				<button class="mc-btn-tool mc-info-toggle" style="display:none;width:28px;height:28px;font-size:14px" title="Session Info">ℹ️</button>
			</div>
			<div class="mc-pinned" id="mc-pinned"><span class="unpin" title="Unpin">✕</span><span class="pinned-text"></span></div>
			<div class="mc-messages"></div>
			<div class="mc-typing"><span></span><span></span><span></span></div>
			<div class="mc-reply-preview"><span class="dismiss">✕</span><span class="reply-text"></span></div>
			<div class="mc-attach-chips"></div>
			<div class="mc-input-area">
				<button class="mc-btn-tool mc-btn-attach" disabled title="Attach file">📎</button>
				<button class="mc-btn-tool mc-btn-mic" disabled title="Voice input">🎤</button>
				<textarea class="mc-input" rows="1" placeholder="Type your request..." disabled></textarea>
				<button class="mc-btn-send" disabled title="Send">➤</button>
			</div>
		`);

		this.$indicator = this.$el.find('.indicator');
		this.$headerTitle = this.$el.find('.mc-header-title');
		this.$client = this.$el.find('.mc-client');
		this.$messages = this.$el.find('.mc-messages');
		this.$typing = this.$el.find('.mc-typing');
		this.$input = this.$el.find('.mc-input');
		this.$replyPreview = this.$el.find('.mc-reply-preview');
		this.$attachChips = this.$el.find('.mc-attach-chips');
		this.$pinned = this.$el.find('#mc-pinned');

		this.$el.find('.mc-start-btn').on('click', () => this.startSession());
		this.$el.find('.mc-end-btn').on('click', () => this.endSession());
		this.$el.find('.mc-btn-send').on('click', () => this.send());
		this.$el.find('.mc-btn-attach').on('click', () => this.pickFile());
		this.$el.find('.mc-btn-mic').on('click', () => this.toggleMic());
		this.$el.find('.mc-info-toggle').on('click', () => this.app.$info.toggleClass('mobile-show'));
		this.$el.find('.mc-reply-preview .dismiss').on('click', () => this.clearReply());
		this.$el.find('.mc-pinned .unpin').on('click', () => { this.pinnedMsg = null; this.$pinned.hide(); });
		this.$input.on('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.send(); });
		this.$input.on('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });

		if (window.innerWidth <= 768) this.$el.find('.mc-info-toggle').show();
	}

	loadClients() {
		this.clientControl = frappe.ui.form.make_control({
			df: {
				fieldtype: 'Link',
				fieldname: 'client_site',
				options: 'AI Client Site',
				placeholder: 'Search clients...',
				get_query: () => ({ filters: { is_active: 1 } }),
			},
			parent: this.$el.find('.mc-client-wrap'),
			render_input: true,
		});
		this.clientControl.$wrapper.find('.like-disabled-input,.control-label').hide();
	}

	setupMic() {
		const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SR) { this.$el.find('.mc-btn-mic').attr('title', 'Voice input not supported in this browser'); return; }
		this.recognition = new SR();
		this.recognition.lang = frappe.boot.lang === 'ar' ? 'ar-SA' : 'en-US';
		this.recognition.interimResults = false;
		this.recognition.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0].transcript).join(' '); this.$input.val((this.$input.val() + ' ' + t).trim()).trigger('input'); };
		this.recognition.onend = () => this.$el.find('.mc-btn-mic').removeClass('recording').text('🎤');
		this.recognition.onerror = () => this.$el.find('.mc-btn-mic').removeClass('recording').text('🎤');
	}

	toggleMic() {
		if (!this.recognition) return;
		const $btn = this.$el.find('.mc-btn-mic');
		if ($btn.hasClass('recording')) { this.recognition.stop(); }
		else { $btn.addClass('recording').text('🔴'); try { this.recognition.start(); } catch (e) { $btn.removeClass('recording').text('🎤'); } }
	}

	activate() {
		this.$input.prop('disabled', false);
		this.$el.find('.mc-btn-send, .mc-btn-attach').prop('disabled', false);
		if (this.recognition) this.$el.find('.mc-btn-mic').prop('disabled', false);
		if (this.clientControl) this.clientControl.$input.prop('disabled', true);
		this.$el.find('.mc-start-btn').hide();
		this.$el.find('.mc-end-btn').show();
		this.$indicator.removeClass('grey red').addClass('green');
		this.$headerTitle.text(`${this.clientSite} — Connected`);
		this.hooks.onTitle && this.hooks.onTitle(this.clientSite);
	}

	async startSession() {
		const client = this.clientControl ? this.clientControl.get_value() : '';
		if (!client) return frappe.msgprint('Select a client first');
		this.clientSite = client;

		// Show type picker
		this.$messages.empty();
		this.showTypePicker();
	}

	showTypePicker() {
		const $picker = $('<div class="mc-type-picker"></div>');
		$picker.append('<h4>Select Request Type</h4>');
		REQUEST_TYPES.forEach((type) => {
			const icon = TYPE_ICONS[type] || '📋';
			const $btn = $(`<div class="mc-type-btn">${icon} ${type}</div>`);
			$btn.on('click', () => this.createSession(type));
			$picker.append($btn);
		});
		this.$messages.html('').append($picker);
	}

	async createSession(requestType) {
		this.requestType = requestType;
		const r = await frappe.call('mubtkir_ai_creator.api.start_session', {
			client_site: this.clientSite, request_type: requestType,
		});
		this.session = r.message.session;
		this.sessionStatus = 'Open';
		this.$messages.empty();
		this.activate();
		this.addBubble('system', `Session started — Client: ${this.clientSite} — Type: ${requestType}`);
		this.refreshInfo();
		this.app.loadConversations();
	}

	async resume(sessionName, clientSite, title, status, requestType) {
		this.session = sessionName; this.clientSite = clientSite; this.requestType = requestType;
		this.sessionStatus = status;
		if (status !== 'Open') {
			await frappe.call('mubtkir_ai_creator.api.reopen_session', { session: sessionName });
			this.sessionStatus = 'Open';
		}
		if (this.clientControl) this.clientControl.set_value(clientSite);
		this.activate();
		this.hooks.onTitle && this.hooks.onTitle(title || clientSite);
		const r = await frappe.call('mubtkir_ai_creator.api.get_session_messages', { session: sessionName });
		this.$messages.empty();
		this.addBubble('system', `Session resumed — ${clientSite}`);
		(r.message || []).forEach((m) => {
			const role = m.role === 'user' ? 'user' : 'bot';
			const text = this.extractText(m.content);
			if (text) this.addBubble(role, frappe.utils.escape_html(text), text);
		});
		this.refreshInfo();
	}

	extractText(content) {
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';
		return '';
	}

	async endSession() {
		frappe.confirm('End this session? You can resume it later from the sidebar.', async () => {
			await frappe.call('mubtkir_ai_creator.api.close_session', { session: this.session });
			this.sessionStatus = 'Closed';
			this.$indicator.removeClass('green').addClass('grey');
			this.addBubble('system', 'Session ended');
			this.$input.prop('disabled', true);
			this.$el.find('.mc-btn-send, .mc-btn-attach, .mc-btn-mic').prop('disabled', true);
			this.$el.find('.mc-end-btn').hide();
			this.refreshInfo();
			this.app.loadConversations();
		});
	}

	addBubble(role, html, rawText) {
		const cls = { user: 'user', bot: 'bot', system: 'system', error: 'error' }[role] || 'bot';
		const $b = $(`<div class="mc-bubble ${cls}"><div class="mc-bubble-text">${html}</div></div>`);

		if (role !== 'system') {
			const text = rawText !== undefined ? rawText : $('<div>').html(html).text();
			const $actions = $('<div class="mc-bubble-actions"></div>');
			$actions.append($('<button>📋 Copy</button>').on('click', () => { frappe.utils.copy_to_clipboard(this.decode(text)); frappe.show_alert({ message: 'Copied', indicator: 'green' }, 2); }));
			$actions.append($('<button>↩ Reply</button>').on('click', () => this.setReply(text)));
			$actions.append($('<button>📌 Pin</button>').on('click', () => this.pinMessage(text)));
			$b.append($actions);
		}

		this.$messages.append($b);
		this.$messages.scrollTop(this.$messages[0].scrollHeight);
	}

	decode(txt) {
		if (!txt) return '';
		try { return String(txt).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
		catch (e) { return String(txt); }
	}

	setReply(text) {
		this.replyTo = text;
		this.$replyPreview.find('.reply-text').text(text.substring(0, 150) + (text.length > 150 ? '...' : ''));
		this.$replyPreview.show();
		this.$input.focus();
	}

	clearReply() { this.replyTo = null; this.$replyPreview.hide(); }

	pinMessage(text) {
		this.pinnedMsg = text;
		this.$pinned.find('.pinned-text').text('📌 ' + text.substring(0, 200));
		this.$pinned.show();
	}

	pickFile() {
		new frappe.ui.FileUploader({
			doctype: 'AI Session', docname: this.session, folder: 'Home/Attachments',
			restrictions: { allowed_file_types: ['.xlsx', '.xlsm', '.csv', '.txt', '.json', '.md', 'image/*'], max_file_size: 5 * 1024 * 1024 },
			on_success: (f) => { this.pendingFiles.push({ url: f.file_url, name: f.file_name }); this.renderAttachments(); },
		});
	}

	renderAttachments() {
		this.$attachChips.empty();
		this.pendingFiles.forEach((f, i) => {
			const $c = $(`<span class="mc-attach-chip">${/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? '🖼️' : '📄'} ${frappe.utils.escape_html(f.name)} <a href="#" class="rm">✕</a></span>`);
			$c.find('.rm').on('click', (e) => { e.preventDefault(); this.pendingFiles.splice(i, 1); this.renderAttachments(); });
			this.$attachChips.append($c);
		});
	}

	async send() {
		let msg = (this.$input.val() || '').trim();
		if (!msg && !this.pendingFiles.length) return;
		if (!this.session) return;

		if (this.replyTo) { msg = `Replying to: "${this.replyTo.substring(0, 150)}"\n\n${msg}`; this.clearReply(); }

		const files = this.pendingFiles.slice();
		const filesNote = files.length ? `\n\n📎 ${files.map((f) => f.name).join(', ')}` : '';

		this.addBubble('user', frappe.utils.escape_html(msg + filesNote));
		this.$input.val('').trigger('input');
		this.pendingFiles = []; this.renderAttachments();

		this.$typing.show();
		this.$messages.scrollTop(this.$messages[0].scrollHeight);

		try {
			const r = await frappe.call('mubtkir_ai_creator.api.send_message', {
				session: this.session, message: msg || 'Review the attachments',
				attachments: JSON.stringify(files.map((f) => f.url)),
			});
			this.$typing.hide();
			this.handleResponse(r.message);
			if (this.app.soundEnabled && document.hidden) NOTIF_SOUND();
		} catch (e) {
			this.$typing.hide();
			this.addBubble('error', 'An error occurred — check Error Log');
		}
		this.refreshInfo();
		this.app.loadConversations();
	}

	handleResponse(res) {
		if (!res) return;
		if (res.type === 'message') return this.addBubble('bot', frappe.utils.escape_html(res.text || ''), res.text);

		if (res.type === 'approval_required') {
			const riskLabel = { Low: 'Low', Medium: 'Medium', High: 'High' }[res.risk_level] || res.risk_level;
			this.addBubble('bot', frappe.utils.escape_html(res.plan || ''), res.plan);
			const $box = $(`
				<div style="border:1px solid var(--mc-border);border-radius:8px;padding:12px;margin-bottom:10px">
					<div style="margin-bottom:8px;font-weight:600">Risk: ${riskLabel} — Approval required</div>
					<pre style="max-height:180px;overflow:auto;font-size:11px;direction:ltr;text-align:left;background:var(--mc-soft);padding:8px;border-radius:6px">${frappe.utils.escape_html(JSON.stringify(res.calls, null, 2))}</pre>
					<div style="display:flex;gap:8px;margin-top:8px">
						<button class="approve" style="padding:6px 16px;border-radius:8px;background:var(--mc-primary);color:#fff;border:none;cursor:pointer">Approve & Execute</button>
						<button class="reject" style="padding:6px 16px;border-radius:8px;background:#fff;color:var(--mc-text);border:1px solid var(--mc-border);cursor:pointer">Reject</button>
					</div>
				</div>
			`);
			$box.find('.approve').on('click', () => this.approve(res.task, $box));
			$box.find('.reject').on('click', () => this.reject(res.task, $box));
			this.$messages.append($box);
			this.$messages.scrollTop(this.$messages[0].scrollHeight);
		}
	}

	async approve(task, $box) {
		$box.find('button').prop('disabled', true);
		this.$typing.show();
		const r = await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.approve', { name: task });
		this.$typing.hide();
		const out = r.message || {};
		if (out.status === 'Completed') {
			this.addBubble('bot', `✅ Executed successfully\n\nVerification:\n${frappe.utils.escape_html(JSON.stringify(out.verification, null, 2))}`);
		} else {
			const err = this.decode(out.error || 'Unknown error — check AI Action Log');
			this.addBubble('error', `❌ Execution failed\n\nReason:\n${frappe.utils.escape_html(err)}`, err);
		}
		this.refreshInfo();
	}

	async reject(task, $box) {
		$box.find('button').prop('disabled', true);
		await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.reject', { name: task });
		this.addBubble('system', 'Operation rejected');
	}

	async refreshInfo() {
		if (!this.session) { this.app.updateInfo('<div style="padding:20px;text-align:center;color:#94a3b8">Start or select a session</div>'); return; }
		try {
			const r = await frappe.call('mubtkir_ai_creator.api.get_session_stats', { session: this.session });
			const s = r.message || {};
			const statusColor = s.status === 'Open' ? 'green' : 'grey';
			const icon = TYPE_ICONS[s.request_type] || '📋';
			this.app.updateInfo(`
				<h5>Session Info</h5>
				<div class="row"><span>Client</span><span class="val">${frappe.utils.escape_html(s.client_site || '')}</span></div>
				<div class="row"><span>Session</span><span class="val">${frappe.utils.escape_html(s.session || '')}</span></div>
				<div class="row"><span>Status</span><span class="val" style="color:${statusColor === 'green' ? 'var(--mc-accent)' : '#94a3b8'}">${s.status || ''}</span></div>
				<div class="row"><span>Type</span><span class="val">${icon} ${frappe.utils.escape_html(s.request_type || '')}</span></div>
				<div class="row"><span>User</span><span class="val">${frappe.utils.escape_html(s.session_user || '')}</span></div>
				<h5>Activity</h5>
				<div class="row"><span>Created</span><span class="val">${s.started_on ? frappe.datetime.str_to_user(s.started_on) : ''}</span></div>
				<div class="row"><span>Last Activity</span><span class="val">${s.modified ? frappe.datetime.comment_when(s.modified) : ''}</span></div>
				<div class="row"><span>Messages</span><span class="val">${s.message_count || 0}</span></div>
				<h5>Stats</h5>
				<div class="row"><span>Tools Used</span><span class="val">${s.tool_count || 0}</span></div>
				<div class="row"><span>Est. Tokens</span><span class="val">${(s.est_tokens || 0).toLocaleString()}</span></div>
			`);
		} catch (e) { /* silent */ }
	}
}
