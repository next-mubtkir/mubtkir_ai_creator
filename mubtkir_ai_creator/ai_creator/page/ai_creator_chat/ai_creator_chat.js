frappe.pages['ai-creator-chat'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({parent:wrapper,title:'Mubtkir AI Creator',single_column:true});
	$(wrapper).find('.page-head').hide();
	new AICreatorApp(page);
};

const TYPES=[
	{id:'Support Request',icon:'ti-tool'},{id:'Print Format',icon:'ti-printer'},
	{id:'Custom Field',icon:'ti-forms'},{id:'Client Script',icon:'ti-code'},
	{id:'Import / Export',icon:'ti-download'},{id:'Server Script',icon:'ti-server'},
	{id:'Custom HTML Block',icon:'ti-code-dots'},{id:'Workspace',icon:'ti-layout-dashboard'},
	{id:'Settings Change',icon:'ti-settings'},{id:'Report / Data Query',icon:'ti-chart-bar'},
	{id:'Transfer from Templates',icon:'ti-copy'},
];
const typeIcon=id=>(TYPES.find(t=>t.id===id)||{icon:'ti-clipboard'}).icon;

const QUICK_PROMPTS={
	'Print Format': ['أضف حقل ضريبة القيمة المضافة لطباعة الفاتورة','عدّل شعار الشركة في الطباعة','أضف رقم الجوال بجانب اسم العميل'],
	'Custom Field': ['أضف حقل رقم الضمان لفاتورة المبيعات','أضف حقل ملاحظات داخلية للطلبات'],
	'Client Script': ['اجعل الحقل إجباري عند تحقق شرط معيّن','أخفِ حقل معيّن حسب نوع العميل'],
	'Server Script': ['وثّق منطق حساب مبلغ معيّن قبل الحفظ'],
	'Custom HTML Block': ['التقط هذا الـ Custom HTML Block كقالب'],
	'Workspace': ['أضف اختصارًا جديدًا لهذا الـ Workspace'],
	'Settings Change': ['فعّل خيار معيّن بإعدادات المخزون'],
	'Report / Data Query': ['اعرض أكثر 10 عملاء مبيعًا هذا الشهر'],
	'Import / Export': ['ساعدني أفهم لماذا فشل استيراد ملف الأصناف'],
	'Transfer from Templates': ['انقل هذا القالب لعميل آخر'],
	'Support Request': ['ليش فشلت آخر عملية نفّذتها؟'],
};

const COLORS=['#3867AE','#0F84B5','#0BA1B8','#644DA6','#243B63','#0F84B5','#3867AE'];
const avatarColor=name=>{let h=0;for(let i=0;i<(name||'').length;i++)h=name.charCodeAt(i)+((h<<5)-h);return COLORS[Math.abs(h)%COLORS.length];};
const avatarLetter=name=>(name||'?')[0].toUpperCase();

const ICO_MIC='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const ICO_STOP='<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const ICO_CLIP='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
const ICO_SEND='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

const _beepSrc='data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LkZeYl5OSjoeAeXJtaWZlZWZnam5ydHd6fICDh4qNj5GSkpGQj42LiYeEgX56d3RycHBwcXN1eHt+gYSHio2PkZOUlJSTkpCOjImGg4B9endzb21raWhoaGlrbXBzdnl9gISHi46RlJaYmZmYl5WTkY6LiIWBfnp2cm9saWhnaGhpam1wdHh8gISIjJCTlpmbnJycm5mXlZKPjImFgX56dnJuamhmZWRkZWdpbHB0eH2BhYqOkpaZnJ6fn5+enJqXlJGNiYWBfXl1cW1pZmRjYmJjZWhrcHR4fYKGi4+TmJueoKKioqGfnZqXk4+LhoJ9eXRwbGhkYmBfX2BhaGtvc3iBhYqPlJmdoKOlpaWkoqCdmZWRjIiDf3p2cWxoZGFfXl1eX2JlaW1xdn2BhoyRlpufoqWnp6emoqCcmJSPi4aDfnl0cGtnY19dXFtcXWBkaW1ydnyBhouQlZqeoqWoqamop6ShnpiUj4uGgXx3cm5qZmJfXVtaW1xeYWVpcHR5f4SJjpOYnaCkp6mpqainpKGdmZSPioWAe3ZxbGhjX1xaWVlZWl1gZGhscXZ8gYaLkJWanqKlqKqrq6qop6OgnJeTjoqFgHt2cWxnY19cWllYWFlaXGBkaW1ydnyBhoyRlpugoqaoq6urqqmmoqCcmJOOioWAe3Zxaw==';
const _beep=new Audio(_beepSrc);_beep.volume=0.3;
function playNotif(){try{_beep.currentTime=0;_beep.play().catch(()=>{});}catch(e){}}

const CSS=`
@import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');
:root{--mc-p:#3867AE;--mc-s:#0F84B5;--mc-a:#0BA1B8;--mc-pu:#644DA6;--mc-t:#243B63;--mc-bd:rgba(56,103,174,.15);--mc-sf:rgba(56,103,174,.05)}
*{box-sizing:border-box}
.mc{font-family:Inter,-apple-system,sans-serif;color:var(--mc-t);height:100vh;display:flex;direction:rtl;position:relative;overflow:hidden}
.mc-left-col{width:clamp(230px,18vw,320px);min-width:0;border-right:0.5px solid var(--mc-bd);display:flex;flex-direction:column;background:#fafbfd;position:relative;transition:width .25s,min-width .25s;overflow:hidden;flex-shrink:0}
.mc-left-col.collapsed{width:0;border:none}
.mc-center{flex:1;display:flex;flex-direction:column;min-width:0;background:#fff;overflow:hidden}
.mc-side{flex:1 1 55%;min-height:120px;display:flex;flex-direction:column;overflow:hidden;border-bottom:0.5px solid var(--mc-bd)}
.mc-info{flex:1 1 45%;min-height:100px;display:flex;flex-direction:column;overflow-y:auto;background:#fafbfd}
.mc-toggle{width:28px;height:28px;border-radius:50%;border:0.5px solid var(--mc-bd);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;z-index:50;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.mc-toggle-left{position:fixed;bottom:16px;left:16px}
.mc-side-hdr{padding:10px 12px;display:flex;align-items:center;gap:6px;border-bottom:0.5px solid var(--mc-bd)}
.mc-side-hdr .t{font-weight:500;font-size:14px;color:var(--mc-p);flex:1}
.mc-new{margin:8px;padding:8px;border-radius:8px;background:var(--mc-p);color:#fff;border:none;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.mc-new:hover{background:var(--mc-s)}
.mc-srch{margin:0 8px 4px;padding:7px 10px;border:0.5px solid var(--mc-bd);border-radius:8px;font-size:11px;background:transparent;outline:none}
.mc-srch:focus{border-color:var(--mc-p)}
.mc-lbl{padding:4px 12px;font-size:10px;color:#94a3b8;font-weight:500}
.mc-cv{padding:8px 12px;border-bottom:0.5px solid var(--mc-sf);cursor:pointer;transition:background .1s}
.mc-cv:hover{background:var(--mc-sf)}
.mc-cv.on{background:rgba(56,103,174,.08);border-right:3px solid var(--mc-p)}
.mc-cv .top{display:flex;align-items:center;gap:6px}
.mc-cv .av{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:11px;color:#fff;flex-shrink:0}
.mc-cv .nm{font-weight:500;font-size:12px;flex:1}
.mc-cv .tm{font-size:10px;color:#94a3b8}
.mc-cv .pr{font-size:10px;color:#94a3b8;margin-top:2px;margin-right:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-cv .mt{display:flex;gap:6px;margin-top:2px;margin-right:34px;font-size:9px;color:#94a3b8;align-items:center}
.mc-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.mc-more{padding:6px;text-align:center;display:none}
.mc-more button{background:transparent;border:0.5px solid var(--mc-bd);border-radius:6px;padding:4px 14px;font-size:10px;cursor:pointer;color:var(--mc-s)}
.mc-less{padding:4px;text-align:center;display:none}
.mc-less button{background:transparent;border:none;font-size:10px;cursor:pointer;color:#94a3b8}
.mc-tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid var(--mc-bd);overflow-x:auto;flex-shrink:0;background:#eef1f6}
.mc-tab{padding:7px 16px;border-radius:8px 8px 0 0;font-size:13px;cursor:pointer;white-space:nowrap;border:1px solid var(--mc-bd);border-bottom:none;display:flex;align-items:center;gap:6px;background:#e2e7ee;color:#64748b;position:relative;top:1px}
.mc-tab.on{background:#fff;color:var(--mc-t);font-weight:500;box-shadow:0 -1px 3px rgba(0,0,0,.04)}
.mc-tab .x{font-size:12px;cursor:pointer;opacity:.5;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center}
.mc-tab .x:hover{opacity:1;background:rgba(0,0,0,.08)}
.mc-hdr{padding:10px 14px;border-bottom:0.5px solid var(--mc-bd);display:flex;align-items:center;gap:10px}
.mc-hdr .av{width:34px;height:34px;border-radius:50%;background:var(--mc-p);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:13px;flex-shrink:0}
.mc-hdr .info{flex:1}
.mc-hdr .nm{font-weight:500;font-size:14px}
.mc-hdr .tags{display:flex;gap:4px;margin-top:2px}
.mc-hdr .tag{font-size:9px;padding:1px 6px;border-radius:6px;background:rgba(56,103,174,.06);color:var(--mc-s);display:flex;align-items:center;gap:3px}
.mc-hdr-btn{padding:4px 10px;border-radius:6px;font-size:10px;border:0.5px solid var(--mc-bd);background:#fff;cursor:pointer;white-space:nowrap}
.mc-hdr-btn:hover{background:var(--mc-sf)}
.mc-hdr-btn.end{border-color:#fca5a5;color:#dc2626}
.mc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.mc-date{text-align:center;font-size:10px;color:#94a3b8;padding:3px 12px;background:rgba(56,103,174,.04);border-radius:10px;align-self:center}
.mc-bbl{max-width:72%;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.6;white-space:pre-wrap;position:relative;word-break:break-word}
.mc-bbl.u{background:var(--mc-p);color:#fff;align-self:flex-start;border-bottom-right-radius:3px}
.mc-bbl.b{background:#f4f6f9;align-self:flex-end;border-bottom-left-radius:3px}
.mc-bbl.s{background:transparent;color:#94a3b8;font-size:10px;text-align:center;align-self:center}
.mc-bbl.w{background:#fffbeb;border:0.5px solid #fcd34d;color:#92400e;font-size:11px;text-align:center;align-self:center}
.mc-bbl.e{background:#fef2f2;border:0.5px solid #fca5a5;align-self:flex-end}
.mc-bbl .tm{font-size:9px;margin-top:3px;opacity:.6}




.mc-bact{display:none;gap:3px;margin-top:4px}.mc-bbl:hover .mc-bact{display:flex}
.mc-bact button{font-size:9px;padding:2px 6px;border-radius:6px;cursor:pointer;border:none;background:rgba(0,0,0,.06);color:var(--mc-t)}
.mc-bbl.u .mc-bact button{background:rgba(255,255,255,.2);color:#fff}
.mc-typing{align-self:flex-end;padding:8px 16px;background:#f4f6f9;border-radius:10px;display:none}
.mc-typing span{display:inline-block;width:6px;height:6px;background:var(--mc-s);border-radius:50%;margin:0 2px;animation:mcb .6s infinite alternate}
.mc-typing span:nth-child(2){animation-delay:.2s}.mc-typing span:nth-child(3){animation-delay:.4s}
@keyframes mcb{to{transform:translateY(-5px);opacity:.4}}
.mc-pin{display:none;padding:6px 12px;background:rgba(56,103,174,.04);border-bottom:0.5px solid var(--mc-bd);font-size:11px;position:relative}
.mc-pin .x{position:absolute;top:4px;left:8px;cursor:pointer;font-size:10px;color:#94a3b8}
.mc-reply{display:none;margin:0 12px 4px;padding:6px 10px;background:var(--mc-sf);border-right:2px solid var(--mc-p);border-radius:4px;font-size:10px;position:relative}
.mc-reply .x{position:absolute;top:2px;left:6px;cursor:pointer;font-size:10px}
.mc-chips{display:flex;flex-wrap:wrap;gap:3px;padding:0 12px;min-height:0}
.mc-chip{font-size:9px;padding:2px 6px;border:0.5px solid var(--mc-bd);border-radius:8px;display:flex;align-items:center;gap:3px}
.mc-ibar{padding:8px 12px;border-top:0.5px solid var(--mc-bd)}
.mc-ibar textarea{width:100%;border:0.5px solid var(--mc-bd);border-radius:8px;padding:8px 10px;font-size:12px;resize:none;outline:none;background:transparent;min-height:36px;max-height:100px}
.mc-ibar textarea:focus{border-color:var(--mc-p)}
.mc-ibar-btns{display:flex;align-items:center;gap:2px;margin-top:6px;justify-content:space-between}
.mc-ibar-left{display:flex;gap:1px}
.mc-ibtn{display:flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:var(--mc-p)}
.mc-ibtn svg{display:block}
.mc-ibtn:hover{background:var(--mc-sf)}
.mc-ibtn:disabled{opacity:.35;cursor:default}
.mc-ibtn.rec{color:#ef4444}
.mc-send{padding:8px 14px;border-radius:8px;background:var(--mc-p);color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mc-send:hover{background:var(--mc-s)}
.mc-send:disabled{opacity:.4;cursor:default}
.mc-tpick{display:flex;flex-direction:column;gap:6px;padding:24px;align-items:center}
.mc-tpick h4{color:var(--mc-t);margin-bottom:8px;font-size:14px;font-weight:500}
.mc-tpick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;direction:ltr;width:100%;max-width:600px}
.mc-tpick-btn{padding:12px 16px;border:0.5px solid var(--mc-bd);border-radius:8px;cursor:pointer;font-size:15px;display:flex;align-items:center;gap:10px;background:#fff;transition:.15s}
.mc-tpick-btn:hover{background:var(--mc-p);color:#fff;border-color:var(--mc-p)}
.mc-tpick-btn:hover i{color:#fff}
.mc-tpick-btn i{font-size:19px;color:var(--mc-p)}
.mc-ip-hdr{padding:10px 12px;font-weight:500;font-size:12px;color:var(--mc-p);border-bottom:0.5px solid var(--mc-bd);display:flex;align-items:center;gap:4px;justify-content:flex-end}
.mc-ip-row{display:flex;align-items:center;padding:6px 12px;gap:8px;font-size:11px}
.mc-ip-row i{font-size:14px;color:var(--mc-p);width:16px;text-align:center;flex-shrink:0}
.mc-ip-row .lbl{font-weight:500;flex:1}
.mc-ip-row .val{color:#64748b;text-align:left}
.mc-ip-div{height:0.5px;background:var(--mc-bd);margin:4px 12px}
.mc-badge{display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:500}
.mc-badge.open{background:#dcfce7;color:#166534}.mc-badge.closed{background:#f1f5f9;color:#64748b}
.mc-hint{font-size:9px;color:#94a3b8;text-align:center;margin-top:2px}
@media(max-width:768px){.mc-left-col{display:none}}
`;

class AICreatorApp{
	constructor(page){
		this.page=page;this.tabs=[];this.activeId=null;this.nextId=1;this.soundOn=true;
		if(!document.getElementById('mc-css')){const s=document.createElement('style');s.id='mc-css';s.textContent=CSS;document.head.appendChild(s);}
		this.page.main.html(`
<div class="mc">
<div class="mc-center">
<div class="mc-tabs" id="mcTabs"></div>
<div id="mcPanels" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
</div>
<span class="mc-toggle mc-toggle-left" id="mcLeftToggle" title="Toggle sidebar">◀</span>
<div class="mc-left-col" id="mcLeftCol">
<div class="mc-side" id="mcSide">
<div class="mc-side-hdr"><span class="t">Mubtkir AI Creator</span><i class="ti ti-bell" id="mcMute" style="font-size:15px;color:var(--mc-p);cursor:pointer" title="Sound on"></i></div>
<button class="mc-new" id="mcNew"><i class="ti ti-plus"></i> New session</button>
<input class="mc-srch" placeholder="Search by client or type..." id="mcSearch"/>
<div class="mc-lbl">Last conversations</div>
<div id="mcConvs" style="flex:1;overflow-y:auto"></div>
<div class="mc-more" id="mcMore"><button><i class="ti ti-chevron-down"></i> Show more</button></div>
<div class="mc-less" id="mcLess"><button>Show less</button></div>
</div>
<div class="mc-info" id="mcInfo">
</div>
</div>
</div>
<div style="display:none;position:fixed;bottom:12px;z-index:1040;gap:6px" id="mcMobBtns">
<button class="mc-ibtn" onclick="$('#mcSide').toggle()" style="width:40px;height:40px;background:#fff;border:0.5px solid var(--mc-bd);border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.1)"><i class="ti ti-menu-2"></i></button>
<button class="mc-ibtn" onclick="$('#mcInfo').toggle()" style="width:40px;height:40px;background:#fff;border:0.5px solid var(--mc-bd);border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.1)"><i class="ti ti-info-circle"></i></button>
</div>`);
		this.$tabs=$('#mcTabs');this.$panels=$('#mcPanels');this.$side=$('#mcSide');this.$info=$('#mcInfo');this.$leftCol=$('#mcLeftCol');
		this.$convs=$('#mcConvs');this.filter='';this.convLimit=5;
		$('#mcNew').on('click',()=>this.newTab());
		$('#mcMute').on('click',()=>{this.soundOn=!this.soundOn;$('#mcMute').toggleClass('ti-bell ti-bell-off').attr('title',this.soundOn?'Sound on':'Sound off');});
		$('#mcSearch').on('input',frappe.utils.debounce(()=>{this.convLimit=5;this.loadConvs();},300));
		$('#mcMore button').on('click',()=>{this.convLimit+=5;this.loadConvs();});
		$('#mcLess button').on('click',()=>{this.convLimit=5;this.loadConvs();});
		$('#mcLeftToggle').on('click',()=>{this.$leftCol.toggleClass('collapsed');$('#mcLeftToggle').text(this.$leftCol.hasClass('collapsed')?'▶':'◀');});
		if(window.innerWidth<=768)$('#mcMobBtns').css('display','flex');
		this.loadConvs();this.newTab();
		this.fitHeight();
		$(window).on('resize.mcfit',()=>this.fitHeight());
	}
	fitHeight(){
		const $mc=this.page.main.find('.mc');
		if(!$mc.length)return;
		const top=$mc[0].getBoundingClientRect().top;
		$mc.css('height',`calc(100vh - ${Math.max(top,0)}px)`);
	}
	async loadConvs(){
		const s=($('#mcSearch').val()||'').trim();
		const r=await frappe.call('mubtkir_ai_creator.api.list_recent_sessions',{search:s||null,request_type:this.filter||null,limit:this.convLimit+1});
		let rows=r.message||[];const more=rows.length>this.convLimit;if(more)rows=rows.slice(0,this.convLimit);
		$('#mcMore').toggle(more);$('#mcLess').toggle(this.convLimit>5);
		this.$convs.empty();
		if(!rows.length){this.$convs.html('<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px">No conversations</div>');return;}
		rows.forEach(row=>{
			const c=avatarColor(row.client_site);const l=avatarLetter(row.client_site);const isOn=row.status==='Open';
			const ic=typeIcon(row.request_type);const active=this.tabs.some(t=>t.chat&&t.chat.session===row.name)?'on':'';
			const $cv=$(`<div class="mc-cv ${active}"><div class="top"><div class="av" style="background:${c}">${l}</div><span class="nm">${frappe.utils.escape_html(row.client_site||'')}</span><span class="tm">${frappe.datetime.comment_when(row.modified)}</span></div><div class="pr">${frappe.utils.escape_html(row.last_message||row.title||'')}</div><div class="mt"><span class="mc-dot" style="background:${isOn?'#22c55e':'#cbd5e1'}"></span><span>${row.request_type||''}</span><span>${row.message_count||0} msgs</span></div></div>`);
			$cv.on('click',()=>this.openConv(row));this.$convs.append($cv);
		});
	}
	openConv(row){
		const ex=this.tabs.find(t=>t.chat&&t.chat.session===row.name);
		if(ex){this.switchTab(ex.id);return;}
		if(row.status!=='Open'){
			frappe.confirm('This session is closed.<br><b>Yes</b> = Reopen and continue<br><b>No</b> = View only (read-only)',()=>this._resume(row,true),()=>this._resume(row,false));
		}else this._resume(row,false);
	}
	_resume(row,reopen){
		const id=this.nextId++;const $p=$('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');
		this.$panels.append($p);const tab={id,title:row.client_site||row.name,panel:$p,chat:null};
		tab.chat=new Chat($p,this,{onTitle:t=>{tab.title=t;this.renderTabs();}});
		this.tabs.push(tab);this.switchTab(id);tab.chat.resume(row.name,row.client_site,row.title,row.status,row.request_type,reopen);
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
	newTab(){const id=this.nextId++;const $p=$('<div style="flex:1;display:flex;flex-direction:column;min-height:0"></div>');this.$panels.append($p);const tab={id,title:'New',panel:$p,chat:null};tab.chat=new Chat($p,this,{onTitle:t=>{tab.title=t;this.renderTabs();}});this.tabs.push(tab);this.switchTab(id);}
	switchTab(id){this.activeId=id;this.tabs.forEach(t=>t.panel.toggle(t.id===id));this.renderTabs();const tab=this.tabs.find(t=>t.id===id);if(tab&&tab.chat)tab.chat.refreshInfo();}
	closeTab(id){const tab=this.tabs.find(t=>t.id===id);if(!tab)return;const fin=()=>{tab.panel.remove();this.tabs=this.tabs.filter(t=>t.id!==id);if(this.activeId===id){this.tabs.length?this.switchTab(this.tabs[this.tabs.length-1].id):this.newTab();}else this.renderTabs();};if(tab.chat&&tab.chat.session&&tab.chat.status==='Open')frappe.call('mubtkir_ai_creator.api.close_session',{session:tab.chat.session}).always(fin);else fin();}
	setInfo(h){this.$info.find('.mc-ip-content').remove();this.$info.append(`<div class="mc-ip-content">${h}</div>`);}
}

class Chat{
	constructor($el,app,hooks){this.$el=$el;this.app=app;this.hooks=hooks||{};this.session=null;this.status=null;this.client=null;this.rtype=null;this.files=[];this.replyTo=null;this.pinned=null;this.lastTaskLog=null;this.mic=null;this.viewOnly=false;this.render();this.initClient();this.initMic();}
	render(){
		this.$el.html(`
<div class="mc-hdr"><div class="av" id="chAv">?</div><div class="info"><div class="nm" id="chNm">Select a client to start</div><div class="tags" id="chTags"></div></div><div id="chBtns"><button class="mc-hdr-btn ch-start">Start session</button></div></div>
<div id="chClientBar" style="padding:8px 14px"><div class="ch-client-wrap"></div></div>
<div class="mc-pin" id="chPin"><span class="x">✕</span><span class="ptxt"></span></div>
<div class="mc-msgs" id="chMsgs"></div>
<div class="mc-typing" id="chTyping"><span></span><span></span><span></span></div>
<div class="mc-reply" id="chReply"><span class="x">✕</span><span class="rtxt"></span></div>
<div class="mc-chips" id="chChips"></div>
<div class="mc-ibar"><textarea class="ch-input" rows="1" placeholder="Type your message here..." disabled></textarea>
<div class="mc-ibar-btns"><div class="mc-ibar-left">
<div class="mc-ibtn ch-attach" title="Attach file">${ICO_CLIP}</div>
<div class="mc-ibtn ch-mic" title="Voice input">${ICO_MIC}</div>
</div><button class="mc-send ch-send" title="Send" disabled>${ICO_SEND}</button></div>
<div class="mc-hint">Press Ctrl+Enter to send</div></div>`);
		this.$msgs=this.$el.find('#chMsgs');this.$typing=this.$el.find('#chTyping');this.$input=this.$el.find('.ch-input');this.$reply=this.$el.find('#chReply');this.$chips=this.$el.find('#chChips');this.$pin=this.$el.find('#chPin');
		this.$el.find('.ch-start').on('click',()=>this.startSession());
		this.$el.find('.ch-send').on('click',()=>this.send());
		this.$el.find('.ch-attach').on('click',()=>this.pickFile());
		this.$el.find('.ch-mic').on('click',()=>this.toggleMic());
		this.$el.find('.ch-copy-conv').on('click',()=>this.copyConv());
		this.$el.find('.ch-reply-btn').on('click',()=>{/* will be triggered from bubble hover */});
		this.$el.find('#chReply .x').on('click',()=>this.clearReply());
		this.$el.find('#chPin .x').on('click',()=>{this.pinned=null;this.$pin.hide();this.savePin();});
		this.$input.on('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))this.send();});
		this.$input.on('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
	}
	initClient(){this.clientCtrl=frappe.ui.form.make_control({df:{fieldtype:'Link',fieldname:'client_site',options:'AI Client Site',placeholder:'Search clients...',get_query:()=>({filters:{is_active:1}})},parent:this.$el.find('.ch-client-wrap'),render_input:true});this.clientCtrl.$wrapper.find('.like-disabled-input,.control-label,.help-box').hide();this.clientCtrl.$wrapper.css('margin-bottom','0');}
	initMic(){this.micSupported=!!(navigator.mediaDevices&&window.MediaRecorder);this.mediaRecorder=null;this.audioChunks=[];if(!this.micSupported){this.$el.find('.ch-mic').attr('title','Voice not supported in this browser').css('opacity','.3');}}
	async toggleMic(){
		if(!this.micSupported)return;
		const $b=this.$el.find('.ch-mic');
		if(this.mediaRecorder&&this.mediaRecorder.state==='recording'){this.mediaRecorder.stop();return;}
		let stream;
		try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
		catch(e){frappe.msgprint('Microphone access denied. Allow microphone in browser settings for this site.');return;}
		this.audioChunks=[];
		const mimeType=window.MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'';
		this.mediaRecorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
		this.mediaRecorder.ondataavailable=e=>{if(e.data&&e.data.size)this.audioChunks.push(e.data);};
		this.mediaRecorder.onstop=()=>{
			$b.removeClass('rec');$b.html(ICO_MIC);
			stream.getTracks().forEach(t=>t.stop());
			const blob=new Blob(this.audioChunks,{type:mimeType||'audio/webm'});
			if(blob.size>500)this.sendAudio(blob);
		};
		try{this.mediaRecorder.start();}catch(e){frappe.msgprint('Could not start voice input: '+e.message);return;}
		$b.addClass('rec');$b.html(ICO_STOP);
	}
	async sendAudio(blob){
		const $b=this.$el.find('.ch-mic');$b.prop('disabled',true);
		const fd=new FormData();fd.append('audio',blob,'voice.webm');
		try{
			const res=await fetch('/api/method/mubtkir_ai_creator.api.transcribe_audio',{method:'POST',headers:{'X-Frappe-CSRF-Token':frappe.csrf_token},body:fd});
			const j=await res.json();
			if(!res.ok)throw new Error('transcription failed');
			const text=(j.message&&j.message.text)||'';
			if(text){const cur=this.$input.val();this.$input.val(cur?cur+' '+text:text).trigger('input');}
			else frappe.show_alert({message:'لم يُلتقط أي كلام',indicator:'orange'},3);
		}catch(e){frappe.msgprint('تعذّر تفريغ الصوت — تحقق من ضبط مفتاح Whisper في AI Settings');}
		finally{$b.prop('disabled',false);}
	}
	enable(){this.$input.prop('disabled',false);this.$el.find('.ch-send').prop('disabled',false);if(this.clientCtrl)this.clientCtrl.$input.prop('disabled',true);this.$el.find('#chClientBar').hide();this.$el.find('#chBtns').html('<button class="mc-hdr-btn end ch-end">End session</button>');this.$el.find('.ch-end').on('click',()=>this.endSession());this.updateHeader();}
	disable(){this.$input.prop('disabled',true);this.$el.find('.ch-send').prop('disabled',true);this.$el.find('#chBtns').html('<span style="font-size:10px;color:#94a3b8">Session ended</span>');}
	updateHeader(){const c=avatarColor(this.client);this.$el.find('#chAv').text(avatarLetter(this.client)).css('background',c);this.$el.find('#chNm').text(this.client||'Select a client');const tags=[];if(this.rtype)tags.push(`<span class="tag"><i class="ti ${typeIcon(this.rtype)}" style="font-size:11px"></i> ${this.rtype}</span>`);if(this.session)tags.push(`<span class="tag">${this.session}</span>`);this.$el.find('#chTags').html(tags.join(''));}
	async startSession(){const c=this.clientCtrl?this.clientCtrl.get_value():'';if(!c)return frappe.msgprint('Select a client first');this.client=c;this.$msgs.empty();this.showTypePicker();}
	showTypePicker(){const $p=$('<div class="mc-tpick"></div>');$p.append('<h4>Select request type</h4>');const $g=$('<div class="mc-tpick-grid"></div>');TYPES.forEach(t=>{const $b=$(`<div class="mc-tpick-btn"><i class="ti ${t.icon}"></i><span>${t.id}</span></div>`);$b.on('click',()=>this.createSession(t.id));$g.append($b);});$p.append($g);this.$msgs.html('').append($p);}
	async createSession(type){this.rtype=type;const r=await frappe.call('mubtkir_ai_creator.api.start_session',{client_site:this.client,request_type:type});this.session=r.message.session;this.status='Open';this.viewOnly=false;this.$msgs.empty();this.enable();this.addB('s',`Session started — Client: ${this.client} — Type: ${type}`);this.showQuickPrompts(type);this.refreshInfo();this.app.loadConvs();this.hooks.onTitle&&this.hooks.onTitle(this.client);}
	showQuickPrompts(type){const prompts=QUICK_PROMPTS[type];if(!prompts||!prompts.length)return;const $wrap=$('<div class="mc-qp" dir="rtl" style="display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 8px"></div>');prompts.forEach(p=>{const $chip=$(`<button class="mc-qp-chip" style="border:0.5px solid var(--mc-bd);border-radius:14px;padding:5px 12px;font-size:11px;background:#fff;color:var(--mc-p);cursor:pointer">${frappe.utils.escape_html(p)}</button>`);$chip.on('click',()=>{this.$input.val(p).trigger('input');this.$input.focus();});$wrap.append($chip);});this.$msgs.append($wrap);}
	async resume(ses,client,title,status,rtype,reopen){this.session=ses;this.client=client;this.rtype=rtype;this.status=status;this.viewOnly=status!=='Open'&&!reopen;if(reopen&&status!=='Open'){await frappe.call('mubtkir_ai_creator.api.reopen_session',{session:ses});this.status='Open';this.viewOnly=false;}if(!this.viewOnly)this.enable();else{this.updateHeader();this.$el.find('#chClientBar').hide();this.$el.find('#chBtns').html('<span style="font-size:10px;color:#94a3b8">View only</span>');}this.hooks.onTitle&&this.hooks.onTitle(title||client);const r=await frappe.call('mubtkir_ai_creator.api.get_session_messages',{session:ses});this.$msgs.empty();this.addB('s',this.viewOnly?`Viewing session (read-only) — ${client}`:`Session resumed — ${client}`);(r.message||[]).forEach(m=>{const role=m.role==='user'?'u':'b';const txt=this.extractText(m.content);if(txt)this.addB(role,frappe.utils.escape_html(txt),txt);});this.loadPin();this.refreshInfo();}
	extractText(c){if(typeof c==='string')return c;if(Array.isArray(c))return c.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'';return '';}
	async endSession(){frappe.confirm('End this session?',async()=>{await frappe.call('mubtkir_ai_creator.api.close_session',{session:this.session});this.status='Closed';this.disable();this.updateHeader();this.addB('s','Session ended');this.refreshInfo();this.app.loadConvs();});}
	dec(t){if(!t)return '';try{return String(t).replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));}catch(e){return String(t);}}
	now(){const d=new Date();return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');}
	addB(role,html,raw){
		const cls={u:'u',b:'b',s:'s',e:'e'}[role]||'b';const time=this.now();
		const $b=$(`<div class="mc-bbl ${cls}"><div>${html}</div>${role!=='s'?`<div class="tm">${time}</div>`:''}</div>`);

		if(role!=='s'){
			const text=raw!==undefined?raw:$('<div>').html(html).text();
			const $a=$('<div class="mc-bact"></div>');
			$a.append($('<button>Copy</button>').on('click',()=>{frappe.utils.copy_to_clipboard(this.dec(text));frappe.show_alert({message:'Copied',indicator:'green'},2);}));
			$a.append($('<button>Reply</button>').on('click',()=>this.setReply(text)));
			$a.append($('<button>Pin</button>').on('click',()=>this.setPin(text)));
			$b.append($a);
		}
		this.$msgs.append($b);this.$msgs.scrollTop(this.$msgs[0].scrollHeight);
	}
	setReply(t){this.replyTo=t;this.$reply.find('.rtxt').text(t.substring(0,100)+(t.length>100?'...':''));this.$reply.show();this.$input.focus();}
	clearReply(){this.replyTo=null;this.$reply.hide();}
	setPin(t){this.pinned=t;this.$pin.find('.ptxt').text(t.substring(0,150));this.$pin.show();this.savePin();}
	savePin(){if(!this.session)return;frappe.call('mubtkir_ai_creator.api.save_pinned',{session:this.session,pinned_message:this.pinned||''});}
	loadPin(){if(!this.session)return;frappe.call({method:'mubtkir_ai_creator.api.get_pinned',args:{session:this.session},callback:r=>{const txt=r.message||'';if(txt){this.pinned=txt;this.$pin.find('.ptxt').text(txt.substring(0,150));this.$pin.show();}}});}
	copyConv(){const texts=[];this.$msgs.find('.mc-bbl').each(function(){texts.push($(this).text().trim());});frappe.utils.copy_to_clipboard(texts.join('\n\n'));frappe.show_alert({message:'Conversation copied',indicator:'green'},2);}
	pickFile(){if(!this.session)return;new frappe.ui.FileUploader({doctype:'AI Session',docname:this.session,folder:'Home/Attachments',restrictions:{allowed_file_types:['.xlsx','.xlsm','.csv','.txt','.json','.md','image/*'],max_file_size:5*1024*1024},on_success:f=>{this.files.push({url:f.file_url,name:f.file_name});this.renderChips();}});}
	renderChips(){this.$chips.empty();this.files.forEach((f,i)=>{const $c=$(`<span class="mc-chip">${/\.(png|jpe?g|gif|webp)$/i.test(f.name)?'img':'file'} ${frappe.utils.escape_html(f.name)} <a href="#" style="color:#94a3b8">✕</a></span>`);$c.find('a').on('click',e=>{e.preventDefault();this.files.splice(i,1);this.renderChips();});this.$chips.append($c);});}
	async send(){if(this.viewOnly)return;let msg=(this.$input.val()||'').trim();if(!msg&&!this.files.length)return;if(!this.session)return;this.$msgs.find('.mc-qp').remove();if(this.replyTo){msg=`Replying to: "${this.replyTo.substring(0,100)}"\n\n${msg}`;this.clearReply();}const files=this.files.slice();const fNote=files.length?`\n📎 ${files.map(f=>f.name).join(', ')}`:'';this.addB('u',frappe.utils.escape_html(msg+fNote));this.$input.val('').trigger('input');this.files=[];this.renderChips();this.$typing.show();this.$msgs.scrollTop(this.$msgs[0].scrollHeight);try{const r=await frappe.call('mubtkir_ai_creator.api.send_message',{session:this.session,message:msg||'Review attachments',attachments:JSON.stringify(files.map(f=>f.url))});this.$typing.hide();this.handleRes(r.message);if(this.app.soundOn)playNotif();}catch(e){this.$typing.hide();this.addB('e','Error — check Error Log');}this.refreshInfo();this.app.loadConvs();}
	handleRes(res){if(!res)return;if(res.cost_warning)this.addB('w',frappe.utils.escape_html(res.cost_warning));if(res.type==='message')return this.addB('b',frappe.utils.escape_html(res.text||''),res.text);if(res.type==='approval_required'){this.addB('b',frappe.utils.escape_html(res.plan||''),res.plan);const rl=res.risk_level;const $box=$(`<div style="border:0.5px solid var(--mc-bd);border-radius:8px;padding:10px;margin-bottom:6px"><div style="margin-bottom:6px;font-weight:500;font-size:11px;color:#92400e">Risk: ${rl} — Approval required</div><pre style="max-height:150px;overflow:auto;font-size:9px;direction:ltr;text-align:left;background:var(--mc-sf);padding:6px;border-radius:6px">${frappe.utils.escape_html(JSON.stringify(res.calls,null,2))}</pre><div style="display:flex;gap:6px;margin-top:6px"><button class="appr mc-send" style="font-size:10px;padding:4px 12px">Approve now</button><button class="sched mc-hdr-btn" style="font-size:10px">Schedule</button><button class="rej mc-hdr-btn" style="font-size:10px">Reject</button></div></div>`);$box.find('.appr').on('click',()=>this.approve(res.task,$box));$box.find('.sched').on('click',()=>this.scheduleTask(res.task,$box));$box.find('.rej').on('click',()=>this.reject(res.task,$box));this.$msgs.append($box);this.$msgs.scrollTop(this.$msgs[0].scrollHeight);}}
	async approve(task,$box){$box.find('button').prop('disabled',true);this.$typing.show();const r=await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.approve',{name:task});this.$typing.hide();const out=r.message||{};if(out.status==='Completed'){this.addB('b','✅ Executed successfully\n\n'+frappe.utils.escape_html(JSON.stringify(out.verification,null,2)));this.showUndo(task);}else{const err=this.dec(out.error||'Unknown error');this.addB('e','❌ Failed\n\n'+frappe.utils.escape_html(err),err);}this.refreshInfo();}
	async reject(task,$box){$box.find('button').prop('disabled',true);await frappe.call('mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.reject',{name:task});this.addB('s','Operation rejected');}
	scheduleTask(task,$box){
		const d=new frappe.ui.Dialog({title:'Schedule execution',fields:[{fieldname:'dt',fieldtype:'Datetime',label:'Execute at',reqd:1}],primary_action_label:'Schedule',primary_action:vals=>{
			$box.find('button').prop('disabled',true);d.hide();
			frappe.call({method:'mubtkir_ai_creator.ai_creator.doctype.ai_task.ai_task.approve',args:{name:task,scheduled_time:vals.dt},callback:r=>{
				const m=r.message||{};this.addB('s',`⏰ Scheduled for: ${m.scheduled_time||vals.dt}`);this.refreshInfo();
			}});
		}});d.show();
	}
	async showUndo(taskName){try{const logs=await frappe.call('frappe.client.get_list',{doctype:'AI Action Log',filters:{task:taskName,is_success:1,tool_name:['in',['update_document','update_print_format','patch_print_format_html','patch_document_field']]},fields:['name','tool_name'],limit_page_length:1,order_by:'timestamp desc'});const row=(logs.message||[])[0];if(!row)return;const chk=await frappe.call('mubtkir_ai_creator.lib.rollback.check_can_rollback',{log_name:row.name});if(!(chk.message||{}).can_rollback)return;this.lastTaskLog=row.name;this.addB('s',`↩ Undo available for: ${row.tool_name}`);const $undo=$(`<div style="text-align:center;margin-bottom:6px"><button class="mc-hdr-btn" style="font-size:10px;color:#92400e;border-color:#fde68a">↩ Undo last action</button></div>`);$undo.find('button').on('click',()=>this.undoLast($undo));this.$msgs.append($undo);this.$msgs.scrollTop(this.$msgs[0].scrollHeight);}catch(e){}}
	async undoLast($el){if(!this.lastTaskLog)return;frappe.confirm('Undo the last write operation?',async()=>{try{const r=await frappe.call('mubtkir_ai_creator.lib.rollback.run_rollback',{log_name:this.lastTaskLog});const m=r.message||{};this.addB('s',`↩ Undo complete — restored: ${(m.restored_fields||[]).join(', ')}`);this.lastTaskLog=null;if($el)$el.remove();}catch(e){frappe.msgprint('Undo failed');}});}
	async refreshInfo(){if(!this.session){this.app.setInfo('<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px">Start or select a session</div>');return;}try{const r=await frappe.call('mubtkir_ai_creator.api.get_session_stats',{session:this.session});const s=r.message||{};const isOpen=s.status==='Open';const ic=typeIcon(s.request_type);this.app.setInfo(`
<div class="mc-ip-hdr"><i class="ti ti-info-circle"></i> Session info</div>
<div class="mc-ip-row"><i class="ti ti-calendar"></i><span class="lbl">Created</span><span class="val">${s.started_on?frappe.datetime.str_to_user(s.started_on):''}</span></div>
<div class="mc-ip-row"><i class="ti ti-clock"></i><span class="lbl">Last activity</span><span class="val">${s.modified?frappe.datetime.comment_when(s.modified):''}</span></div>
<div class="mc-ip-row"><i class="ti ti-message"></i><span class="lbl">Messages</span><span class="val">${s.message_count||0}</span></div>
<div class="mc-ip-row"><i class="ti ti-circle-check"></i><span class="lbl">Status</span><span class="val"><span class="mc-badge ${isOpen?'open':'closed'}">${s.status||''}</span></span></div>
<div class="mc-ip-div"></div>
<div class="mc-ip-row"><i class="ti ti-user"></i><span class="lbl">User</span><span class="val">${frappe.utils.escape_html(s.session_user||'')}</span></div>
<div class="mc-ip-row"><i class="ti ${ic}"></i><span class="lbl">Request type</span><span class="val">${frappe.utils.escape_html(s.request_type||'')}</span></div>
<div class="mc-ip-row"><i class="ti ti-building"></i><span class="lbl">Client</span><span class="val">${frappe.utils.escape_html(s.client_site||'')}</span></div>
<div class="mc-ip-div"></div>
<div class="mc-ip-row"><i class="ti ti-tool"></i><span class="lbl">Tools used</span><span class="val">${s.tool_count||0}</span></div>
<div class="mc-ip-row"><i class="ti ti-chart-bar"></i><span class="lbl">Est. tokens</span><span class="val">${(s.est_tokens||0).toLocaleString()}</span></div>`);}catch(e){}}
}
