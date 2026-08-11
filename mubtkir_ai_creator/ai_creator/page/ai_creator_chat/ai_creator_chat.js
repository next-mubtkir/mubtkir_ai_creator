frappe.pages['ai-creator-chat'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Mubtkir AI Creator',
		single_column: true,
	});

	new AICreatorApp(page);
};

// ============ مدير التبويبات ============
class AICreatorApp {
	constructor(page) {
		this.page = page;
		this.tabs = [];
		this.active_id = null;
		this.next_id = 1;

		this.render_shell();
		this.new_tab();
	}

	render_shell() {
		this.page.main.html(`
			<div class="ai-app" dir="rtl" style="max-width:1000px;margin:0 auto;">
				<div class="ai-tabbar" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;border-bottom:1px solid var(--border-color);padding-bottom:8px;"></div>
				<div class="ai-panels"></div>
			</div>
		`);
		this.$tabbar = this.page.main.find('.ai-tabbar');
		this.$panels = this.page.main.find('.ai-panels');
	}

	render_tabbar() {
		this.$tabbar.empty();

		this.tabs.forEach((tab) => {
			const active = tab.id === this.active_id;
			const $chip = $(`
				<div class="ai-tab-chip" style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:16px;cursor:pointer;font-size:12px;
					background:${active ? 'var(--bg-blue)' : 'var(--bg-light-gray)'};border:1px solid ${active ? 'var(--blue)' : 'var(--border-color)'};">
					<span class="ai-tab-title">${frappe.utils.escape_html(tab.title || 'محادثة جديدة')}</span>
					<a href="#" class="ai-tab-close" style="color:var(--text-muted);">✕</a>
				</div>
			`);
			$chip.on('click', (e) => {
				if ($(e.target).hasClass('ai-tab-close')) return;
				this.switch_tab(tab.id);
			});
			$chip.find('.ai-tab-close').on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.close_tab(tab.id);
			});
			this.$tabbar.append($chip);
		});

		const $add = $(`<button class="btn btn-xs btn-default" title="محادثة جديدة">＋ جديدة</button>`);
		$add.on('click', () => this.new_tab());
		this.$tabbar.append($add);

		const $history = $(`<button class="btn btn-xs btn-default" title="استعراض المحادثات السابقة">📜 محادثات سابقة</button>`);
		$history.on('click', () => this.open_history());
		this.$tabbar.append($history);
	}

	new_tab() {
		const id = this.next_id++;
		const $panel = $('<div class="ai-panel"></div>');
		this.$panels.append($panel);

		const tab = { id, title: 'محادثة جديدة', panel: $panel, chat: null };
		tab.chat = new ChatTab($panel, {
			onTitleChange: (t) => {
				tab.title = t;
				this.render_tabbar();
			},
			onClosed: () => this.close_tab(id),
		});

		this.tabs.push(tab);
		this.switch_tab(id);
	}

	switch_tab(id) {
		this.active_id = id;
		this.tabs.forEach((t) => t.panel.toggle(t.id === id));
		this.render_tabbar();
	}

	close_tab(id) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) return;

		const finish = () => {
			tab.panel.remove();
			this.tabs = this.tabs.filter((t) => t.id !== id);
			if (this.active_id === id) {
				if (this.tabs.length) {
					this.switch_tab(this.tabs[this.tabs.length - 1].id);
				} else {
					this.active_id = null;
					this.new_tab();
				}
			} else {
				this.render_tabbar();
			}
		};

		if (tab.chat.session && tab.chat.session_status === 'Open') {
			frappe.call('mubtkir_ai_creator.api.close_session', { session: tab.chat.session }).always(finish);
		} else {
			finish();
		}
	}

	async open_history() {
		const r = await frappe.call('mubtkir_ai_creator.api.list_recent_sessions', { limit: 30 });
		const rows = r.message || [];

		const d = new frappe.ui.Dialog({
			title: __('المحادثات السابقة'),
			size: 'large',
			fields: [{ fieldname: 'list', fieldtype: 'HTML' }],
		});

		if (!rows.length) {
			d.fields_dict.list.$wrapper.html('<div dir="rtl">لا توجد محادثات سابقة</div>');
		} else {
			const $list = $('<div dir="rtl" style="max-height:60vh;overflow:auto;"></div>');
			rows.forEach((row) => {
				const badge = row.status === 'Open' ? 'green' : 'grey';
				const $item = $(`
					<div style="border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;">
						<div style="display:flex;justify-content:space-between;">
							<b>${frappe.utils.escape_html(row.title || row.name)}</b>
							<span class="indicator ${badge}">${row.status === 'Open' ? 'مفتوحة' : 'مغلقة'}</span>
						</div>
						<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
							العميل: ${frappe.utils.escape_html(row.client_site || '')} — ${row.message_count} رسالة — آخر تحديث: ${frappe.datetime.comment_when(row.modified)}
						</div>
						<div style="font-size:12px;margin-top:6px;color:var(--text-color);">${frappe.utils.escape_html(row.last_message || '')}</div>
					</div>
				`);
				$item.on('click', () => {
					d.hide();
					this.resume_session(row);
				});
				$list.append($item);
			});
			d.fields_dict.list.$wrapper.html('').append($list);
		}

		d.show();
	}

	async resume_session(row) {
		const id = this.next_id++;
		const $panel = $('<div class="ai-panel"></div>');
		this.$panels.append($panel);

		const tab = { id, title: row.title || row.name, panel: $panel, chat: null };
		tab.chat = new ChatTab($panel, {
			onTitleChange: (t) => {
				tab.title = t;
				this.render_tabbar();
			},
			onClosed: () => this.close_tab(id),
		});

		this.tabs.push(tab);
		this.switch_tab(id);

		await tab.chat.resume(row.name, row.client_site, row.title, row.status);
	}
}

// ============ محادثة واحدة (تبويب واحد) ============
class ChatTab {
	constructor($container, hooks) {
		this.$container = $container;
		this.hooks = hooks || {};
		this.session = null;
		this.session_status = null;
		this.client_site = null;
		this.pending_files = [];
		this.recognition = null;
		this.render();
		this.load_clients();
	}

	render() {
		this.$container.html(`
			<div class="ai-topbar" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
				<div style="flex:1;"><select class="form-control ai-client"></select></div>
				<button class="btn btn-primary btn-sm ai-start">بدء جلسة</button>
				<button class="btn btn-default btn-sm ai-end" style="display:none;">إنهاء المحادثة</button>
				<span class="ai-status text-muted" style="font-size:12px;"></span>
			</div>
			<div class="ai-chat" style="border:1px solid var(--border-color);border-radius:8px;padding:12px;height:50vh;overflow-y:auto;background:var(--fg-color);"></div>
			<div class="ai-attachments" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;"></div>
			<div style="display:flex;gap:8px;margin-top:8px;align-items:flex-end;">
				<button class="btn btn-default ai-attach" disabled title="إرفاق ملف Excel أو صورة">📎</button>
				<button class="btn btn-default ai-mic" disabled title="إدخال صوتي">🎤</button>
				<textarea class="form-control ai-input" rows="2" placeholder="اكتب طلبك... مثال: أضف حقل مخصص باسم رقم العقد في فاتورة المبيعات" disabled></textarea>
				<button class="btn btn-primary ai-send" disabled>إرسال</button>
			</div>
		`);

		this.$client = this.$container.find('.ai-client');
		this.$chat = this.$container.find('.ai-chat');
		this.$input = this.$container.find('.ai-input');
		this.$status = this.$container.find('.ai-status');
		this.$attachments = this.$container.find('.ai-attachments');
		this.$startBtn = this.$container.find('.ai-start');
		this.$endBtn = this.$container.find('.ai-end');
		this.$micBtn = this.$container.find('.ai-mic');

		this.$container.find('.ai-attach').on('click', () => this.pick_file());
		this.$startBtn.on('click', () => this.start_session());
		this.$endBtn.on('click', () => this.end_session());
		this.$container.find('.ai-send').on('click', () => this.send());
		this.$micBtn.on('click', () => this.toggle_mic());
		this.$input.on('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.send();
		});

		this.setup_mic();
	}

	setup_mic() {
		const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SR) {
			this.$micBtn.prop('disabled', true).attr('title', 'الإدخال الصوتي غير مدعوم في هذا المتصفح (يعمل على Chrome)');
			return;
		}
		this.recognition = new SR();
		this.recognition.lang = frappe.boot.lang === 'ar' ? 'ar-SA' : 'en-US';
		this.recognition.interimResults = false;
		this.recognition.continuous = false;

		this.recognition.onresult = (e) => {
			const text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
			const current = this.$input.val();
			this.$input.val(current ? current + ' ' + text : text);
		};
		this.recognition.onerror = () => this.$micBtn.removeClass('btn-danger');
		this.recognition.onend = () => this.$micBtn.removeClass('btn-danger').text('🎤');
	}

	toggle_mic() {
		if (!this.recognition) return;
		if (this.$micBtn.hasClass('btn-danger')) {
			this.recognition.stop();
		} else {
			this.$micBtn.addClass('btn-danger').text('🔴 يستمع...');
			try {
				this.recognition.start();
			} catch (e) {
				this.$micBtn.removeClass('btn-danger').text('🎤');
			}
		}
	}

	async load_clients() {
		const r = await frappe.call('mubtkir_ai_creator.api.get_clients');
		const opts = (r.message || [])
			.map((c) => `<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.client_name)} — ${frappe.utils.escape_html(c.status)}</option>`)
			.join('');
		this.$client.html(opts || '<option value="">لا يوجد عملاء مفعّلون</option>');
	}

	activate_inputs() {
		this.$input.prop('disabled', false);
		this.$container.find('.ai-send, .ai-attach, .ai-mic').prop('disabled', !this.recognition && false);
		this.$container.find('.ai-send, .ai-attach').prop('disabled', false);
		if (this.recognition) this.$micBtn.prop('disabled', false);
		this.$client.prop('disabled', true);
		this.$startBtn.hide();
		this.$endBtn.show();
	}

	async start_session() {
		const client = this.$client.val();
		if (!client) return frappe.msgprint('اختر عميلًا أولًا');

		const r = await frappe.call('mubtkir_ai_creator.api.start_session', { client_site: client });
		this.session = r.message.session;
		this.client_site = r.message.client_site;
		this.session_status = 'Open';

		this.$chat.empty();
		this.activate_inputs();
		this.$status.text(`الجلسة ${this.session} — العميل ${this.client_site}`);
		this.add_bubble('system', `بدأت الجلسة على حساب: ${this.client_site}`);
		this.hooks.onTitleChange && this.hooks.onTitleChange(this.client_site);
	}

	async resume(session_name, client_site, title, status) {
		this.session = session_name;
		this.client_site = client_site;
		this.session_status = status;

		if (status !== 'Open') {
			await frappe.call('mubtkir_ai_creator.api.reopen_session', { session: session_name });
			this.session_status = 'Open';
		}

		this.$client.val(client_site).prop('disabled', true);
		this.activate_inputs();
		this.$status.text(`الجلسة ${this.session} — العميل ${this.client_site}`);
		this.hooks.onTitleChange && this.hooks.onTitleChange(title || client_site);

		const r = await frappe.call('mubtkir_ai_creator.api.get_session_messages', { session: session_name });
		this.$chat.empty();
		this.add_bubble('system', `تمت متابعة المحادثة على حساب: ${client_site}`);
		this.render_history(r.message || []);
	}

	render_history(messages) {
		messages.forEach((m) => {
			const role = m.role === 'user' ? 'user' : 'assistant';
			const text = this.extract_text(m.content);
			if (text) this.add_bubble(role, frappe.utils.escape_html(text), text);
		});
	}

	extract_text(content) {
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content
				.map((b) => {
					if (b.type === 'text') return b.text;
					if (b.type === 'image') return '[صورة مرفقة]';
					if (b.type === 'tool_use') return `[استدعاء أداة: ${b.name}]`;
					if (b.type === 'tool_result') return null; // نتائج الأدوات لا تُعرض في السجل المختصر
					return null;
				})
				.filter(Boolean)
				.join('\n');
		}
		return '';
	}

	async end_session() {
		frappe.confirm('إنهاء هذه المحادثة؟ يمكنك متابعتها لاحقًا من «محادثات سابقة».', async () => {
			await frappe.call('mubtkir_ai_creator.api.close_session', { session: this.session });
			this.session_status = 'Closed';
			this.add_bubble('system', 'أُنهيت المحادثة — يمكنك متابعتها لاحقًا من محادثات سابقة');
			this.$input.prop('disabled', true);
			this.$container.find('.ai-send, .ai-attach, .ai-mic').prop('disabled', true);
			this.$endBtn.hide();
		});
	}

	decode_unicode(txt) {
		if (!txt) return '';
		try {
			return String(txt).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
		} catch (e) {
			return String(txt);
		}
	}

	add_bubble(role, html, raw_text) {
		const styles = {
			user: 'background:var(--bg-blue);margin-inline-start:auto;',
			assistant: 'background:var(--bg-light-gray);',
			system: 'background:transparent;color:var(--text-muted);font-size:12px;text-align:center;',
			error: 'background:var(--bg-red);',
		};

		const $bubble = $(
			`<div style="position:relative;max-width:80%;padding:10px 12px;border-radius:8px;margin-bottom:10px;white-space:pre-wrap;${styles[role] || ''}"></div>`
		);
		$bubble.append(`<div class="ai-bubble-body">${html}</div>`);

		if (role !== 'system') {
			const text = raw_text !== undefined ? raw_text : $('<div>').html(html).text();
			const $btn = $('<button class="btn btn-xs btn-default" style="margin-top:8px;">📋 نسخ</button>');
			$btn.on('click', () => {
				frappe.utils.copy_to_clipboard(this.decode_unicode(text));
				frappe.show_alert({ message: __('تم النسخ'), indicator: 'green' }, 3);
			});
			$bubble.append($btn);
		}

		this.$chat.append($bubble);
		this.$chat.scrollTop(this.$chat[0].scrollHeight);
	}

	pick_file() {
		new frappe.ui.FileUploader({
			doctype: 'AI Session',
			docname: this.session,
			folder: 'Home/Attachments',
			restrictions: {
				allowed_file_types: ['.xlsx', '.xlsm', '.csv', '.txt', '.json', '.md', 'image/*'],
				max_file_size: 5 * 1024 * 1024,
			},
			on_success: (file_doc) => {
				this.pending_files.push({ url: file_doc.file_url, name: file_doc.file_name });
				this.render_attachments();
			},
		});
	}

	render_attachments() {
		this.$attachments.empty();
		this.pending_files.forEach((f, i) => {
			const is_img = /\.(png|jpe?g|gif|webp)$/i.test(f.name || '');
			const $chip = $(`
				<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border-color);border-radius:14px;font-size:12px;">
					${is_img ? '🖼️' : '📄'} ${frappe.utils.escape_html(f.name)}
					<a href="#" class="ai-rm" style="color:var(--text-muted);">✕</a>
				</span>
			`);
			$chip.find('.ai-rm').on('click', (e) => {
				e.preventDefault();
				this.pending_files.splice(i, 1);
				this.render_attachments();
			});
			this.$attachments.append($chip);
		});
	}

	async send() {
		const msg = (this.$input.val() || '').trim();
		if ((!msg && !this.pending_files.length) || !this.session) return;

		const files = this.pending_files.slice();
		const files_note = files.length ? `\n\n📎 مرفقات: ${files.map((f) => f.name).join('، ')}` : '';

		this.add_bubble('user', frappe.utils.escape_html(msg + files_note));
		this.$input.val('');
		this.pending_files = [];
		this.render_attachments();
		this.$status.text('جارٍ المعالجة...');

		try {
			const r = await frappe.call('mubtkir_ai_creator.api.send_message', {
				session: this.session,
				message: msg || 'راجع المرفقات ووضّح ما تفهمه منها',
				attachments: JSON.stringify(files.map((f) => f.url)),
			});
			this.handle_response(r.message);
		} catch (e) {
			this.add_bubble('error', 'حدث خطأ أثناء المعالجة — راجع Error Log');
		}
		this.$status.text(`الجلسة ${this.session} — العميل ${this.client_site}`);
	}

	handle_response(res) {
		if (!res) return;

		if (res.type === 'message') {
			return this.add_bubble('assistant', frappe.utils.escape_html(res.text || ''), res.text || '');
		}

		if (res.type === 'approval_required') {
			const risk_ar = { Low: 'منخفضة', Medium: 'متوسطة', High: 'مرتفعة' }[res.risk_level] || res.risk_level;
			this.add_bubble('assistant', frappe.utils.escape_html(res.plan || ''), res.plan || '');

			const $box = $(`
				<div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:10px;">
					<div style="margin-bottom:8px;"><b>خطورة العملية: ${risk_ar}</b> — تتطلب موافقة</div>
					<pre style="max-height:220px;overflow:auto;font-size:12px;direction:ltr;text-align:left;">${frappe.utils.escape_html(JSON.stringify(res.calls, null, 2))}</pre>
					<button class="btn btn-primary btn-sm ai-approve">اعتماد وتنفيذ</button>
					<button class="btn btn-default btn-sm ai-reject">رفض</button>
				</div>
			`);
			$box.find('.ai-approve').on('click', () => this.approve(res.task, $box));
			$box.find('.ai-reject').on('click', () => this.reject(res.task, $box));
			this.$chat.append($box);
			this.$chat.scrollTop(this.$chat[0].scrollHeight);
		}
	}

	async approve(task, $box) {
		$box.find('button').prop('disabled', true);
		this.$status.text('جارٍ التنفيذ...');
		const r = await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.approve', { name: task });
		const out = r.message || {};

		if (out.status === 'Completed') {
			const v = JSON.stringify(out.verification, null, 2);
			this.add_bubble('assistant', `✅ تم التنفيذ بنجاح\n\nالتحقق:\n${frappe.utils.escape_html(v)}`, v);
		} else {
			const err = this.decode_unicode(out.error || 'غير محدد — راجع AI Action Log');
			this.add_bubble('error', `❌ فشل التنفيذ\n\nسبب الفشل:\n${frappe.utils.escape_html(err)}`, err);
		}
	}

	async reject(task, $box) {
		$box.find('button').prop('disabled', true);
		await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.reject', { name: task });
		this.add_bubble('system', 'تم رفض العملية');
	}
}
