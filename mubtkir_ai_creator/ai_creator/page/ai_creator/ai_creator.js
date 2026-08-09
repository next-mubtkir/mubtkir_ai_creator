frappe.pages['ai-creator'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Mubtkir AI Creator',
		single_column: true,
	});

	new AICreator(page);
};

class AICreator {
	constructor(page) {
		this.page = page;
		this.session = null;
		this.client_site = null;
		this.render();
		this.load_clients();
	}

	render() {
		this.page.main.html(`
			<div class="ai-creator" dir="rtl" style="max-width:900px;margin:0 auto;">
				<div class="ai-topbar" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
					<div style="flex:1;"><select class="form-control ai-client"></select></div>
					<button class="btn btn-primary btn-sm ai-start">بدء جلسة</button>
					<span class="ai-status text-muted" style="font-size:12px;"></span>
				</div>
				<div class="ai-chat" style="border:1px solid var(--border-color);border-radius:8px;padding:12px;height:52vh;overflow-y:auto;background:var(--fg-color);"></div>
				<div style="display:flex;gap:8px;margin-top:12px;">
					<textarea class="form-control ai-input" rows="2" placeholder="اكتب طلبك... مثال: أضف حقل مخصص باسم رقم العقد في فاتورة المبيعات" disabled></textarea>
					<button class="btn btn-primary ai-send" disabled>إرسال</button>
				</div>
			</div>
		`);

		this.$client = this.page.main.find('.ai-client');
		this.$chat = this.page.main.find('.ai-chat');
		this.$input = this.page.main.find('.ai-input');
		this.$status = this.page.main.find('.ai-status');

		this.page.main.find('.ai-start').on('click', () => this.start_session());
		this.page.main.find('.ai-send').on('click', () => this.send());
		this.$input.on('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.send();
		});
	}

	async load_clients() {
		const r = await frappe.call('mubtkir_ai_creator.api.get_clients');
		const opts = (r.message || [])
			.map((c) => `<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.client_name)} — ${frappe.utils.escape_html(c.status)}</option>`)
			.join('');
		this.$client.html(opts || '<option value="">لا يوجد عملاء مفعّلون</option>');
	}

	async start_session() {
		const client = this.$client.val();
		if (!client) return frappe.msgprint('اختر عميلًا أولًا');

		const r = await frappe.call('mubtkir_ai_creator.api.start_session', { client_site: client });
		this.session = r.message.session;
		this.client_site = r.message.client_site;

		this.$chat.empty();
		this.$input.prop('disabled', false);
		this.page.main.find('.ai-send').prop('disabled', false);
		this.$client.prop('disabled', true); // قفل الجلسة على الموقع
		this.$status.text(`الجلسة ${this.session} — العميل ${this.client_site}`);
		this.add_bubble('system', `بدأت الجلسة على حساب: ${this.client_site}`);
	}

	add_bubble(role, html) {
		const styles = {
			user: 'background:var(--bg-blue);margin-inline-start:auto;',
			assistant: 'background:var(--bg-light-gray);',
			system: 'background:transparent;color:var(--text-muted);font-size:12px;text-align:center;',
			error: 'background:var(--bg-red);',
		};
		this.$chat.append(
			`<div style="max-width:80%;padding:10px 12px;border-radius:8px;margin-bottom:10px;white-space:pre-wrap;${styles[role] || ''}">${html}</div>`
		);
		this.$chat.scrollTop(this.$chat[0].scrollHeight);
	}

	async send() {
		const msg = (this.$input.val() || '').trim();
		if (!msg || !this.session) return;

		this.add_bubble('user', frappe.utils.escape_html(msg));
		this.$input.val('');
		this.$status.text('جارٍ المعالجة...');

		try {
			const r = await frappe.call('mubtkir_ai_creator.api.send_message', {
				session: this.session,
				message: msg,
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
			return this.add_bubble('assistant', frappe.utils.escape_html(res.text || ''));
		}

		if (res.type === 'approval_required') {
			const risk_ar = { Low: 'منخفضة', Medium: 'متوسطة', High: 'مرتفعة' }[res.risk_level] || res.risk_level;
			this.add_bubble('assistant', frappe.utils.escape_html(res.plan || ''));

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
		this.add_bubble(
			out.status === 'Completed' ? 'assistant' : 'error',
			`نتيجة التنفيذ: ${frappe.utils.escape_html(out.status || '')}\n\nالتحقق:\n${frappe.utils.escape_html(JSON.stringify(out.verification, null, 2))}`
		);
	}

	async reject(task, $box) {
		$box.find('button').prop('disabled', true);
		await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.reject', { name: task });
		this.add_bubble('system', 'تم رفض العملية');
	}
}
