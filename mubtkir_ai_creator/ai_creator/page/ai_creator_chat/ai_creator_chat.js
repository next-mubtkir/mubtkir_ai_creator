frappe.pages['ai-creator-chat'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({parent:wrapper,title:'Mubtkir AI Creator',single_column:true});
	$(wrapper).find('.page-head').hide();
	new AICreatorApp(page);
};

const TYPES = [
	{id:'Support Request',icon:'🛠️'},{id:'Custom Field / Print Format',icon:'📝'},
	{id:'Report / Data Query',icon:'📊'},{id:'Import / Export',icon:'📥'},
	{id:'Settings Change',icon:'⚙️'},{id:'Client Script',icon:'💻'},
	{id:'Server Script',icon:'🖥️'},{id:'Print Format Design',icon:'🖨️'},{id:'Other',icon:'📋'},
];
const typeIcon = id => (TYPES.find(t=>t.id===id)||{}).icon||'📋';

/* ═══ Notification Sound ═══ */
let _sndCtx;
function playNotif(){
	try{
		if(!_sndCtx) _sndCtx=new(window.AudioContext||window.webkitAudioContext)();
		const o=_sndCtx.createOscillator(),g=_sndCtx.createGain();
		o.frequency.value=880;o.type='sine';g.gain.value=0.1;
		o.connect(g);g.connect(_sndCtx.destination);o.start();o.stop(_sndCtx.currentTime+0.15);
	}catch(e){}
}
/* warm up audio context on first user click (browser policy) */
$(document).one('click',()=>{try{if(!_sndCtx)_sndCtx=new(window.AudioContext||window.webkitAudioContext)();_sndCtx.resume();}catch(e){}});

/* ═══ Theme ═══ */
const CSS = `
:root{--p:#3867AE;--s:#0F84B5;--a:#0BA1B8;--pu:#644DA6;--t:#243B63;--bd:rgba(56,103,174,.18);--sf:rgba(56,103,174,.06);--ubg:#3867AE;--bbg:#f4f6f9;--sbg:#fafbfd}
.dark-theme{--bbg:#1e293b;--sbg:#0f172a;--t:#e2e8f0;--sf:rgba(56,103,174,.15)}
*{box-sizing:border-box}
.mc{font-family:Inter,-apple-system,sans-serif;color:var(--t);height:calc(100vh - 60px);display:flex;direction:rtl}
.mc-side{width:260px;min-width:220px;border-inline-start:1px solid var(--bd);background:var(--sbg);display:flex;flex-direction:column;overflow:hidden}
.mc-info-panel{width:240px;min-width:200px;border-inline-end:1px solid var(--bd);background:var(--sbg);overflow-y:auto;padding:0}
.mc-main{flex:1;display:flex;flex-direction:column;min-width:0;background:#fff}
/* sidebar */
.mc-side-hdr{padding:10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--bd)}
.mc-side-hdr .title{font-weight:700;font-size:14px;color:var(--p);flex:1}
.mc-new-btn{width:100%;padding:8px;border-radius:8px;background:var(--p);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:600}
.mc-new-btn:hover{background:var(--s)}
.mc-search{width:100%;padding:8px 10px;border:none;border-bottom:1px solid var(--bd);font-size:12px;outline:none;background:transparent}
.mc-filter-bar{display:flex;gap:3px;padding:6px;overflow-x:auto;flex-shrink:0;border-bottom:1px solid var(--bd)}
.mc-fpill{padding:3px 8px;border-radius:10px;font-size:10px;cursor:pointer;white-space:nowrap;border:1px solid var(--bd);background:transparent;transition:.15s}
.mc-fpill.on{background:var(--p);color:#fff;border-color:var(--p)}
.mc-fpill:hover:not(.on){background:var(--sf)}
.mc-conv{padding:10px;cursor:pointer;border-bottom:1px solid var(--sf);transition:.1s}
.mc-conv:hover{background:var(--sf)}
.mc-conv .top{display:flex;justify-content:space-between;align-items:center}
.mc-conv .cname{font-weight:600;font-size:13px;display:flex;align-items:center;gap:4px}
.mc-conv .ctime{font-size:10px;color:#94a3b8}
.mc-conv .cprev{font-size:11px;color:#94a3b8;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-conv .cmeta{font-size:10px;color:#94a3b8;margin-top:2px;display:flex;gap:6px}
.mc-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.mc-dot.on{background:#22c55e}.mc-dot.off{background:#cbd5e1}
.mc-more-btn{display:none;padding:8px;text-align:center;border-top:1px solid var(--bd)}
.mc-more-btn button{background:transparent;border:1px solid var(--bd);border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer;color:var(--s)}
/* tabs */
.mc-tabs{display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--bd);overflow-x:auto;flex-shrink:0}
.mc-tab{padding:4px 10px;border-radius:14px;font-size:11px;cursor:pointer;white-space:nowrap;border:1px solid var(--bd);display:flex;align-items:center;gap:5px}
.mc-tab.on{background:var(--p);color:#fff;border-color:var(--p)}
.mc-tab .x{font-size:9px;cursor:pointer;opacity:.6}.mc-tab .x:hover{opacity:1}
/* header */
.mc-hdr{padding:10px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px}
.mc-hdr-avatar{width:36px;height:36px;border-radius:50%;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
.mc-hdr-info{flex:1}
.mc-hdr-name{font-weight:700;font-size:14px}
.mc-hdr-tags{display:flex;gap:4px;margin-top:2px}
.mc-hdr-tag{font-size:10px;padding:1px 6px;border-radius:8px;background:var(--sf);color:var(--s)}
.mc-hdr-btns{display:flex;gap:6px}
.mc-hdr-btn{padding:5px 12px;border-radius:6px;font-size:11px;border:1px solid var(--bd);background:#fff;cursor:pointer;white-space:nowrap}
.mc-hdr-btn:hover{background:var(--sf)}
.mc-hdr-btn.danger{color:#dc2626;border-color:#fca5a5}
.mc-hdr-btn.danger:hover{background:#fef2f2}
/* undo bar */
.mc-undo{display:none;padding:6px 14px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:12px;display:none;align-items:center;gap:8px}
.mc-undo button{padding:3px 10px;border-radius:6px;border:1px solid #f59e0b;background:#fff;cursor:pointer;font-size:11px;color:#92400e}
/* pinned */
.mc-pin{display:none;padding:6px 14px;background:var(--sf);border-bottom:1px solid var(--bd);font-size:12px;position:relative}
.mc-pin .x{position:absolute;top:4px;left:8px;cursor:pointer;font-size:10px}
/* messages */
.mc-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
.mc-bbl{max-width:75%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;position:relative;word-break:break-word}
.mc-bbl.u{background:var(--ubg);color:#fff;align-self:flex-start;border-bottom-right-radius:4px}
.mc-bbl.b{background:var(--bbg);align-self:flex-end;border-bottom-left-radius:4px}
.mc-bbl.s{background:transparent;color:#94a3b8;font-size:11px;text-align:center;align-self:center}
.mc-bbl.e{background:#fef2f2;border:1px solid #fca5a5;align-self:flex-end}
.mc-bact{display:none;gap:4px;margin-top:5px}.mc-bbl:hover .mc-bact{display:flex}
.mc-bact button{font-size:10px;padding:2px 7px;border-radius:8px;border:1px solid rgba(0,0,0,.15);cursor:pointer}
.mc-bbl.u .mc-bact button{background:rgba(255,255,255,.25);color:#fff;border-color:rgba(255,255,255,.3)}
.mc-bbl.b .mc-bact button{background:#fff;color:var(--t);border-color:var(--bd)}
/* typing */
.mc-typing{align-self:flex-end;padding:8px 16px;background:var(--bbg);border-radius:12px;display:none}
.mc-typing span{display:inline-block;width:7px;height:7px;background:var(--s);border-radius:50%;margin:0 2px;animation:tbounce .6s infinite alternate}
.mc-typing span:nth-child(2){animation-delay:.2s}.mc-typing span:nth-child(3){animation-delay:.4s}
@keyframes tbounce{to{transform:translateY(-5px);opacity:.4}}
/* input */
.mc-reply{display:none;padding:6px 14px;background:var(--sf);border-right:3px solid var(--p);margin:0 14px 4px;border-radius:4px;font-size:11px;position:relative}
.mc-reply .x{position:absolute;top:2px;left:6px;cursor:pointer}
.mc-chips{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px;min-height:0}
.mc-chip{font-size:10px;padding:2px 7px;border:1px solid var(--bd);border-radius:10px;display:flex;align-items:center;gap:3px}
.mc-ibar{padding:10px 14px;border-top:1px solid var(--bd);display:flex;gap:6px;align-items:flex-end}
.mc-ibar textarea{flex:1;resize:none;border:1px solid var(--bd);border-radius:10px;padding:8px 12px;font-size:13px;max-height:100px;min-height:38px;outline:none}
.mc-ibar textarea:focus{border-color:var(--p)}
.mc-ibtn{width:34px;height:34px;border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;flex-shrink:0;transition:.15s}
.mc-ibtn.send{background:var(--p);color:#fff}.mc-ibtn.send:hover{background:var(--s)}
.mc-ibtn.tool{background:var(--sf);color:var(--t)}.mc-ibtn.tool:hover{background:var(--bd)}
.mc-ibtn.tool.rec{background:#ef4444;color:#fff}
.mc-ibtn:disabled{opacity:.4;cursor:default}
/* info panel */
.mc-ip-hdr{padding:12px;font-weight:700;font-size:13px;color:var(--p);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:6px}
.mc-ip-section{padding:10px 12px}
.mc-ip-row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px}
.mc-ip-row .icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
.mc-ip-row .lbl{flex:1;color:#64748b}
.mc-ip-row .val{font-weight:600;text-align:left}
.mc-ip-divider{height:1px;background:var(--bd);margin:0 12px}
.mc-ip-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.mc-ip-badge.open{background:#dcfce7;color:#166534}.mc-ip-badge.closed{background:#f1f5f9;color:#64748b}
/* type picker */
.mc-tpick{display:flex;flex-direction:column;gap:6px;padding:30px;align-items:center}
.mc-tpick h4{color:var(--t);margin-bottom:10px;font-size:15px}
.mc-tpick-btn{width:100%;max-width:280px;padding:10px;border:1px solid var(--bd);border-radius:8px;cursor:pointer;font-size:12px;transition:.15s;display:flex;align-items:center;gap:8px;background:#fff}
.mc-tpick-btn:hover{background:var(--p);color:#fff;border-color:var(--p)}
/* responsive */
@media(max-width:768px){.mc-side,.mc-info-panel{display:none}.mc-side.mshow,.mc-info-panel.mshow{display:flex;position:fixed;top:0;right:0;bottom:0;z-index:1050;width:85vw;box-shadow:-4px 0 20px rgba(0,0,0,.2)}}
`;

/* ═══ App ═══ */
class AICreatorApp {
	constructor(page){
		this.page=page;this.tabs=[];this.activeId=null;this.nextId=1;this.soundOn=true;
		if(!document.getElementById('mc-css')){const s=document.createElement('style');s.id='mc-css';s.textContent=CSS;document.head.appendChild(s);}
		if(document.body.classList.contains('dark'))document.documentElement.classList.add('dark-theme');
		this.page.main.html(`
<div class="mc">
	<div class="mc-side" id="mcSide">
		<div class="mc-side-hdr">
			<span class="title">Mubtkir AI Creator</span>
			<button class="mc-ibtn tool" id="mcMute" title="Sound on">🔔</button>
		</div>
		<div style="padding:8px"><button class="mc-new-btn" id="mcNew">+ New Session</button></div>
		<input class="mc-search" placeholder="Search by client or type..." id="mcSearch"/>
		<div class="mc-filter-bar" id="mcFilter"></div>
		<div style="padding:4px 10px;font-size:11px;color:#94a3b8;font-weight:600">Last conversations</div>
		<div id="mcConvs" style="flex:1;overflow-y:auto"></div>
		<div class="mc-more-btn" id="mcMore"><button>Show more ▼</button></div>
	</div>
	<div class="mc-main">
		<div class="mc-tabs" id="mcTabs"></div>
		<div id="mcPanels" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
	</div>
	<div class="mc-info-panel" id="mcInfo"></div>
</div>
<button class="mc-ibtn tool" id="mcMobBtn" style="display:none;position:fixed;bottom:14px;right:14px;z-index:1040;width:44px;height:44px;font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,.2)">☰</button>`);
		this.$tabs=$('#mcTabs');this.$panels=$('#mcPanels');this.$side=$('#mcSide');this.$info=$('#mcInfo');
		this.$convs=$('#mcConvs');this.$search=$('#mcSearch');this.filter='';this.convLimit=5;
		$('#mcNew').on('click',()=>this.newTab());
		$('#mcMute').on('click',()=>{this.soundOn=!this.soundOn;$('#mcMute').text(this.soundOn?'🔔':'🔇').attr('title',this.soundOn?'Sound on':'Sound off');});
		this.$search.on('input',frappe.utils.debounce(()=>{this.convLimit=5;this.loadConvs();},300));
		$('#mcMore button').on('click',()=>{this.convLimit+=5;this.loadConvs();});
		$('#mcMobBtn').on('click',()=>this.$side.toggleClass('mshow'));
		if(window.innerWidth<=768)$('#mcMobBtn').show();
		this.buildFilter();this.loadConvs();this.newTab();
	}
	buildFilter(){
		const $f=$('#mcFilter');$f.empty();
		const $all=$('<span class="mc-fpill on">All</span>');
		$all.on('click',()=>{this.filter='';this.convLimit=5;$f.find('.mc-fpill').removeClass('on');$all.addClass('on');this.loadConvs();});
		$f.append($all);
		TYPES.forEach(t=>{
			const $p=$(`<span class="mc-fpill" title="${t.id}">${t.icon} ${t.id.split('/')[0].split(' ')[0]}</span>`);
			$p.on('click',()=>{this.filter=t.id;this.convLimit=5;$f.find('.mc-fpill').removeClass('on');$p.addClass('on');this.loadConvs();});
			$f.append($p);
		});
	}
	async loadConvs(){
		const s=(this.$search.val()||'').trim();
		const r=await frappe.call('mubtkir_ai_creator.api.list_recent_sessions',{search:s||null,request_type:this.filter||null,limit:this.convLimit+1});
		let rows=r.message||[];const more=rows.length>this.convLimit;if(more)rows=rows.slice(0,this.convLimit);
		$('#mcMore').toggle(more);this.$convs.empty();
		if(!rows.length){this.$convs.html('<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">No conversations</div>');return;}
		rows.forEach(row=>{
			const ico=typeIcon(row.request_type);const isOpen=row.status==='Open';
			const $c=$(`<div class="mc-conv">
				<div class="top"><span class="cname">${ico} ${frappe.utils.escape_html(row.client_site||'')}</span><span class="ctime">${frappe.datetime.comment_when(row.modified)}</span></div>
				<div class="cprev">${frappe.utils.escape_html(row.last_message||row.title||'')}</div>
				<div class="cmeta"><span class="mc-dot ${isOpen?'on':'off'}"></span><span>${row.request_type||''}</span><span>${row.message_count||0} msgs</span></div>
			</div>`);
			$c.on('click',()=>{this.$side.removeClass('mshow');this.openConv(row);});
			this.$convs.append($c);
		});
	}
	openConv(row){
		const ex=this.tabs.find(t=>t.chat&&t.chat.session===row.name);
		if(ex){this.switchTab(ex.id);return;}
		if(row.status!=='Open'){
			frappe.confirm('This session is closed.<br><br><b>Reopen</b> to continue chatting, or <b>View only</b> to read without changes?',
				()=>this._resumeTab(row,true),
				()=>this._resumeTab(row,false)
			);
		} else this._resumeTab(row,false);
	}
	_resumeTab(row,reopen){
		const id=this.nextId++;const $p=$('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');
		this.$panels.append($p);
		const tab={id,title:row.client_site||row.name,panel:$p,chat:null};
		tab.chat=new Chat($p,this,{onTitle:t=>{tab.title=t;this.renderTabs();}});
		this.tabs.push(tab);this.switchTab(id);
		tab.chat.resume(row.name,row.client_site,row.title,row.status,row.request_type,reopen);
	}
	renderTabs(){
		this.$tabs.empty();
		this.tabs.forEach(tab=>{
			const on=tab.id===this.activeId;
			const $t=$(`<div class="mc-tab ${on?'on':''}"><span>${frappe.utils.escape_html(tab.title||'New')}</span><span class="x">✕</span></div>`);
			$t.on('click',e=>{if(!$(e.target).hasClass('x'))this.switchTab(tab.id);});
			$t.find('.x').on('click',e=>{e.stopPropagation();this.closeTab(tab.id);});
			this.$tabs.append($t);
		});
	}
	newTab(){
		const id=this.nextId++;const $p=$('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');
		this.$panels.append($p);const tab={id,title:'New',panel:$p,chat:null};
		tab.chat=new Chat($p,this,{onTitle:t=>{tab.title=t;this.renderTabs();}});
		this.tabs.push(tab);this.switchTab(id);
	}
	switchTab(id){this.activeId=id;this.tabs.forEach(t=>t.panel.toggle(t.id===id));this.renderTabs();const tab=this.tabs.find(t=>t.id===id);if(tab&&tab.chat)tab.chat.refreshInfo();}
	closeTab(id){
		const tab=this.tabs.find(t=>t.id===id);if(!tab)return;
		const fin=()=>{tab.panel.remove();this.tabs=this.tabs.filter(t=>t.id!==id);if(this.activeId===id){this.tabs.length?this.switchTab(this.tabs[this.tabs.length-1].id):this.newTab();}else this.renderTabs();};
		if(tab.chat&&tab.chat.session&&tab.chat.status==='Open')frappe.call('mubtkir_ai_creator.api.close_session',{session:tab.chat.session}).always(fin);else fin();
	}
	setInfo(h){this.$info.html(h);}
}

/* ═══ Chat Panel ═══ */
class Chat {
	constructor($el,app,hooks){
		this.$el=$el;this.app=app;this.hooks=hooks||{};
		this.session=null;this.status=null;this.client=null;this.rtype=null;
		this.files=[];this.replyTo=null;this.pinned=null;this.lastTaskLog=null;
		this.mic=null;this.viewOnly=false;
		this.render();this.initClient();this.initMic();
	}
	render(){
		this.$el.html(`
<div class="mc-hdr">
	<div class="mc-hdr-avatar" id="chAvatar">?</div>
	<div class="mc-hdr-info"><div class="mc-hdr-name" id="chName">Select a client to start</div><div class="mc-hdr-tags" id="chTags"></div></div>
	<div class="mc-hdr-btns">
		<button class="mc-hdr-btn ch-undo" style="display:none" title="Undo last action">↩ Undo</button>
		<button class="mc-hdr-btn ch-end" style="display:none">End Session</button>
		<button class="mc-hdr-btn ch-start">Start Session</button>
		<button class="mc-ibtn tool ch-info-btn" style="display:none" title="Info">ℹ️</button>
	</div>
</div>
<div class="mc-hdr" id="chClientBar" style="padding:8px 14px;gap:8px">
	<div class="ch-client-wrap" style="flex:1"></div>
</div>
<div class="mc-pin" id="chPin"><span class="x">✕</span><span class="ptxt"></span></div>
<div class="mc-undo" id="chUndoBar" style="display:none"><span>⚠️ Last action can be undone:</span><button class="undo-btn">Undo</button><span class="undo-name"></span></div>
<div class="mc-msgs" id="chMsgs"></div>
<div class="mc-typing" id="chTyping"><span></span><span></span><span></span></div>
<div class="mc-reply" id="chReply"><span class="x">✕</span><span class="rtxt"></span></div>
<div class="mc-chips" id="chChips"></div>
<div class="mc-ibar">
	<button class="mc-ibtn tool ch-attach" disabled title="Attach">📎</button>
	<button class="mc-ibtn tool ch-mic" disabled title="Voice">🎤</button>
	<textarea class="ch-input" rows="1" placeholder="Type your request..." disabled></textarea>
	<button class="mc-ibtn send ch-send" disabled title="Send">➤</button>
</div>`);
		this.$msgs=this.$el.find('#chMsgs');this.$typing=this.$el.find('#chTyping');
		this.$input=this.$el.find('.ch-input');this.$reply=this.$el.find('#chReply');
		this.$chips=this.$el.find('#chChips');this.$pin=this.$el.find('#chPin');
		this.$undo=this.$el.find('#chUndoBar');
		this.$el.find('.ch-start').on('click',()=>this.startSession());
		this.$el.find('.ch-end').on('click',()=>this.endSession());
		this.$el.find('.ch-send').on('click',()=>this.send());
		this.$el.find('.ch-attach').on('click',()=>this.pickFile());
		this.$el.find('.ch-mic').on('click',()=>this.toggleMic());
		this.$el.find('.ch-info-btn').on('click',()=>this.app.$info.toggleClass('mshow'));
		this.$el.find('#chReply .x').on('click',()=>this.clearReply());
		this.$el.find('#chPin .x').on('click',()=>{this.pinned=null;this.$pin.hide();});
		this.$el.find('.ch-undo').on('click',()=>this.undoLast());
		this.$el.find('#chUndoBar .undo-btn').on('click',()=>this.undoLast());
		this.$input.on('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))this.send();});
		this.$input.on('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
		if(window.innerWidth<=768)this.$el.find('.ch-info-btn').show();
	}
	initClient(){
		this.clientCtrl=frappe.ui.form.make_control({
			df:{fieldtype:'Link',fieldname:'client_site',options:'AI Client Site',placeholder:'Search clients...',get_query:()=>({filters:{is_active:1}})},
			parent:this.$el.find('.ch-client-wrap'),render_input:true,
		});
		this.clientCtrl.$wrapper.find('.like-disabled-input,.control-label,.help-box').hide();
		this.clientCtrl.$wrapper.css('margin-bottom','0');
	}
	initMic(){
		const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
		if(!SR){this.$el.find('.ch-mic').attr('title','Voice not supported');return;}
		this.mic=new SR();this.mic.lang=frappe.boot.lang==='ar'?'ar-SA':'en-US';this.mic.interimResults=false;
		this.mic.onresult=e=>{const t=Array.from(e.results).map(r=>r[0].transcript).join(' ');this.$input.val((this.$input.val()+' '+t).trim()).trigger('input');};
		this.mic.onend=()=>this.$el.find('.ch-mic').removeClass('rec').text('🎤');
		this.mic.onerror=()=>this.$el.find('.ch-mic').removeClass('rec').text('🎤');
	}
	toggleMic(){
		if(!this.mic)return;const $b=this.$el.find('.ch-mic');
		if($b.hasClass('rec')){this.mic.stop();}
		else{$b.addClass('rec').text('🔴');try{this.mic.start();}catch(e){$b.removeClass('rec').text('🎤');}}
	}
	enable(){
		this.$input.prop('disabled',false);
		this.$el.find('.ch-send,.ch-attach').prop('disabled',false);
		if(this.mic)this.$el.find('.ch-mic').prop('disabled',false);
		if(this.clientCtrl)this.clientCtrl.$input.prop('disabled',true);
		this.$el.find('.ch-start').hide();this.$el.find('.ch-end').show();
		this.$el.find('#chClientBar').hide();
		this.updateHeader();
	}
	disable(){
		this.$input.prop('disabled',true);
		this.$el.find('.ch-send,.ch-attach,.ch-mic').prop('disabled',true);
		this.$el.find('.ch-end').hide();
	}
	updateHeader(){
		const init=(this.client||'?')[0].toUpperCase();
		this.$el.find('#chAvatar').text(init);
		this.$el.find('#chName').text(this.client?(this.client+' — '+(this.status==='Open'?'Connected':'Closed')):'Select a client');
		const tags=[];
		if(this.rtype)tags.push(`<span class="mc-hdr-tag">${typeIcon(this.rtype)} ${this.rtype}</span>`);
		if(this.session)tags.push(`<span class="mc-hdr-tag">${this.session}</span>`);
		this.$el.find('#chTags').html(tags.join(''));
	}
	async startSession(){
		const c=this.clientCtrl?this.clientCtrl.get_value():'';
		if(!c)return frappe.msgprint('Select a client first');
		this.client=c;this.$msgs.empty();this.showTypePicker();
	}
	showTypePicker(){
		const $p=$('<div class="mc-tpick"></div>');
		$p.append('<h4>Select Request Type</h4>');
		TYPES.forEach(t=>{
			const $b=$(`<div class="mc-tpick-btn"><span style="font-size:18px">${t.icon}</span><span>${t.id}</span></div>`);
			$b.on('click',()=>this.createSession(t.id));$p.append($b);
		});
		this.$msgs.html('').append($p);
	}
	async createSession(type){
		this.rtype=type;
		const r=await frappe.call('mubtkir_ai_creator.api.start_session',{client_site:this.client,request_type:type});
		this.session=r.message.session;this.status='Open';this.viewOnly=false;
		this.$msgs.empty();this.enable();
		this.addB('s',`Session started — Client: ${this.client} — Type: ${type}`);
		this.refreshInfo();this.app.loadConvs();
		this.hooks.onTitle&&this.hooks.onTitle(this.client);
	}
	async resume(ses,client,title,status,rtype,reopen){
		this.session=ses;this.client=client;this.rtype=rtype;this.status=status;
		this.viewOnly=status!=='Open'&&!reopen;
		if(reopen&&status!=='Open'){
			await frappe.call('mubtkir_ai_creator.api.reopen_session',{session:ses});this.status='Open';this.viewOnly=false;
		}
		if(!this.viewOnly)this.enable();else{this.updateHeader();this.$el.find('#chClientBar').hide();this.$el.find('.ch-start').hide();}
		this.hooks.onTitle&&this.hooks.onTitle(title||client);
		const r=await frappe.call('mubtkir_ai_creator.api.get_session_messages',{session:ses});
		this.$msgs.empty();
		this.addB('s',this.viewOnly?`Viewing session (read-only) — ${client}`:`Session resumed — ${client}`);
		(r.message||[]).forEach(m=>{const role=m.role==='user'?'u':'b';const txt=this.extractText(m.content);if(txt)this.addB(role,frappe.utils.escape_html(txt),txt);});
		this.refreshInfo();
	}
	extractText(c){if(typeof c==='string')return c;if(Array.isArray(c))return c.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'';return '';}
	async endSession(){
		frappe.confirm('End this session? You can resume later.',async()=>{
			await frappe.call('mubtkir_ai_creator.api.close_session',{session:this.session});
			this.status='Closed';this.disable();this.updateHeader();
			this.addB('s','Session ended');this.refreshInfo();this.app.loadConvs();
		});
	}
	addB(role,html,raw){
		const cls={u:'u',b:'b',s:'s',e:'e'}[role]||'b';
		const $b=$(`<div class="mc-bbl ${cls}"><div>${html}</div></div>`);
		if(role!=='s'){
			const text=raw!==undefined?raw:$('<div>').html(html).text();
			const $a=$('<div class="mc-bact"></div>');
			$a.append($('<button>📋 Copy</button>').on('click',()=>{frappe.utils.copy_to_clipboard(this.dec(text));frappe.show_alert({message:'Copied',indicator:'green'},2);}));
			if(!this.viewOnly)$a.append($('<button>↩ Reply</button>').on('click',()=>this.setReply(text)));
			$a.append($('<button>📌 Pin</button>').on('click',()=>this.setPin(text)));
			$b.append($a);
		}
		this.$msgs.append($b);this.$msgs.scrollTop(this.$msgs[0].scrollHeight);
	}
	dec(t){if(!t)return '';try{return String(t).replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));}catch(e){return String(t);}}
	setReply(t){this.replyTo=t;this.$reply.find('.rtxt').text(t.substring(0,120)+(t.length>120?'...':''));this.$reply.show();this.$input.focus();}
	clearReply(){this.replyTo=null;this.$reply.hide();}
	setPin(t){this.pinned=t;this.$pin.find('.ptxt').text('📌 '+t.substring(0,180));this.$pin.show();}
	pickFile(){
		if(!this.session)return;
		new frappe.ui.FileUploader({doctype:'AI Session',docname:this.session,folder:'Home/Attachments',
			restrictions:{allowed_file_types:['.xlsx','.xlsm','.csv','.txt','.json','.md','image/*'],max_file_size:5*1024*1024},
			on_success:f=>{this.files.push({url:f.file_url,name:f.file_name});this.renderChips();},
		});
	}
	renderChips(){
		this.$chips.empty();
		this.files.forEach((f,i)=>{
			const $c=$(`<span class="mc-chip">${/\.(png|jpe?g|gif|webp)$/i.test(f.name)?'🖼️':'📄'} ${frappe.utils.escape_html(f.name)} <a href="#" class="rm" style="color:#94a3b8">✕</a></span>`);
			$c.find('.rm').on('click',e=>{e.preventDefault();this.files.splice(i,1);this.renderChips();});
			this.$chips.append($c);
		});
	}
	async send(){
		if(this.viewOnly)return;
		let msg=(this.$input.val()||'').trim();if(!msg&&!this.files.length)return;if(!this.session)return;
		if(this.replyTo){msg=`Replying to: "${this.replyTo.substring(0,120)}"\n\n${msg}`;this.clearReply();}
		const files=this.files.slice();const fNote=files.length?`\n\n📎 ${files.map(f=>f.name).join(', ')}`:'';
		this.addB('u',frappe.utils.escape_html(msg+fNote));
		this.$input.val('').trigger('input');this.files=[];this.renderChips();
		this.$typing.show();this.$msgs.scrollTop(this.$msgs[0].scrollHeight);
		try{
			const r=await frappe.call('mubtkir_ai_creator.api.send_message',{session:this.session,message:msg||'Review attachments',attachments:JSON.stringify(files.map(f=>f.url))});
			this.$typing.hide();this.handleRes(r.message);
			if(this.app.soundOn&&document.hidden)playNotif();
		}catch(e){this.$typing.hide();this.addB('e','Error — check Error Log');}
		this.refreshInfo();this.app.loadConvs();
	}
	handleRes(res){
		if(!res)return;
		if(res.type==='message')return this.addB('b',frappe.utils.escape_html(res.text||''),res.text);
		if(res.type==='approval_required'){
			const rl={Low:'Low',Medium:'Medium',High:'High'}[res.risk_level]||res.risk_level;
			this.addB('b',frappe.utils.escape_html(res.plan||''),res.plan);
			const $box=$(`<div style="border:1px solid var(--bd);border-radius:8px;padding:12px;margin-bottom:8px">
				<div style="margin-bottom:6px;font-weight:600;font-size:12px">⚠️ Risk: ${rl} — Approval required</div>
				<pre style="max-height:160px;overflow:auto;font-size:10px;direction:ltr;text-align:left;background:var(--sf);padding:8px;border-radius:6px">${frappe.utils.escape_html(JSON.stringify(res.calls,null,2))}</pre>
				<div style="display:flex;gap:6px;margin-top:8px">
					<button class="appr" style="padding:5px 14px;border-radius:6px;background:var(--p);color:#fff;border:none;cursor:pointer;font-size:11px">Approve & Execute</button>
					<button class="rej" style="padding:5px 14px;border-radius:6px;background:#fff;color:var(--t);border:1px solid var(--bd);cursor:pointer;font-size:11px">Reject</button>
				</div></div>`);
			$box.find('.appr').on('click',()=>this.approve(res.task,$box));
			$box.find('.rej').on('click',()=>this.reject(res.task,$box));
			this.$msgs.append($box);this.$msgs.scrollTop(this.$msgs[0].scrollHeight);
		}
	}
	async approve(task,$box){
		$box.find('button').prop('disabled',true);this.$typing.show();
		const r=await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.approve',{name:task});
		this.$typing.hide();const out=r.message||{};
		if(out.status==='Completed'){
			this.addB('b','✅ Executed successfully\n\n'+frappe.utils.escape_html(JSON.stringify(out.verification,null,2)));
			this.showUndoOption(task);
		}else{
			const err=this.dec(out.error||'Unknown error');
			this.addB('e','❌ Failed\n\n'+frappe.utils.escape_html(err),err);
		}
		this.refreshInfo();
	}
	async reject(task,$box){$box.find('button').prop('disabled',true);await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.reject',{name:task});this.addB('s','Operation rejected');}
	async showUndoOption(taskName){
		try{
			const logs=await frappe.call('frappe.client.get_list',{doctype:'AI Action Log',filters:{task:taskName,is_success:1,tool_name:['in',['update_document','update_print_format','patch_print_format_html','patch_document_field']]},fields:['name','tool_name'],limit_page_length:1,order_by:'timestamp desc'});
			const row=(logs.message||[])[0];if(!row)return;
			const chk=await frappe.call('mubtkir_ai_creator.lib.rollback.check_can_rollback',{log_name:row.name});
			if(!(chk.message||{}).can_rollback)return;
			this.lastTaskLog=row.name;
			this.$el.find('.ch-undo').show();
			this.$undo.find('.undo-name').text(row.tool_name);this.$undo.show();
		}catch(e){}
	}
	async undoLast(){
		if(!this.lastTaskLog)return;
		frappe.confirm('Undo the last write operation on the client site?',async()=>{
			try{
				const r=await frappe.call('mubtkir_ai_creator.lib.rollback.run_rollback',{log_name:this.lastTaskLog});
				const m=r.message||{};
				this.addB('s',`↩ Undo complete — restored: ${(m.restored_fields||[]).join(', ')}`);
				this.lastTaskLog=null;this.$el.find('.ch-undo').hide();this.$undo.hide();
			}catch(e){frappe.msgprint('Undo failed — check Error Log');}
		});
	}
	async refreshInfo(){
		if(!this.session){this.app.setInfo('<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">Start or select a session</div>');return;}
		try{
			const r=await frappe.call('mubtkir_ai_creator.api.get_session_stats',{session:this.session});const s=r.message||{};
			const isOpen=s.status==='Open';const ico=typeIcon(s.request_type);
			this.app.setInfo(`
				<div class="mc-ip-hdr">ℹ️ Session Info</div>
				<div class="mc-ip-section">
					<div class="mc-ip-row"><span class="icon">🏢</span><span class="lbl">Client</span><span class="val">${frappe.utils.escape_html(s.client_site||'')}</span></div>
					<div class="mc-ip-row"><span class="icon">📋</span><span class="lbl">Status</span><span class="val"><span class="mc-ip-badge ${isOpen?'open':'closed'}">${s.status||''}</span></span></div>
					<div class="mc-ip-row"><span class="icon">${ico}</span><span class="lbl">Type</span><span class="val">${frappe.utils.escape_html(s.request_type||'')}</span></div>
					<div class="mc-ip-row"><span class="icon">👤</span><span class="lbl">User</span><span class="val">${frappe.utils.escape_html(s.session_user||'')}</span></div>
				</div>
				<div class="mc-ip-divider"></div>
				<div class="mc-ip-section">
					<div class="mc-ip-row"><span class="icon">📅</span><span class="lbl">Created</span><span class="val">${s.started_on?frappe.datetime.str_to_user(s.started_on):''}</span></div>
					<div class="mc-ip-row"><span class="icon">🕐</span><span class="lbl">Last Activity</span><span class="val">${s.modified?frappe.datetime.comment_when(s.modified):''}</span></div>
					<div class="mc-ip-row"><span class="icon">💬</span><span class="lbl">Messages</span><span class="val">${s.message_count||0}</span></div>
				</div>
				<div class="mc-ip-divider"></div>
				<div class="mc-ip-section">
					<div class="mc-ip-row"><span class="icon">🔧</span><span class="lbl">Tools Used</span><span class="val">${s.tool_count||0}</span></div>
					<div class="mc-ip-row"><span class="icon">📊</span><span class="lbl">Est. Tokens</span><span class="val">${(s.est_tokens||0).toLocaleString()}</span></div>
				</div>
			`);
		}catch(e){}
	}
}
