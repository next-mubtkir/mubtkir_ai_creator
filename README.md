# Mubtkir AI Creator

تطبيق Frappe يعمل داخل حساب Mubtkir كـ«خبير ERPNext آلي مركزي»: الموظف يختار عميلًا، يعطي أمرًا بالعربية، والوكيل يقرأ حساب العميل الفعلي عبر REST API، يبني خطة، يعرضها، وينفذ بعد الموافقة ثم يتحقق ويسجل كل شيء.

## التثبيت (على سايت تجريبي بدون Press)

```bash
cd ~/frappe-bench
bench get-app mubtkir_ai_creator /path/to/mubtkir_ai_creator
bench --site your-test-site install-app mubtkir_ai_creator
bench --site your-test-site migrate
bench restart
```

## الإعداد الأولي

1. افتح **AI Settings** واضبط: مزود النموذج، اسم النموذج، مفتاح API.
2. أنشئ سجل **AI Client Site** لكل عميل:
   - رابط الموقع (https فقط، بدون / في النهاية)
   - API Key و API Secret الخاصين بـ Administrator في موقع العميل
   - للحصول عليهما: في موقع العميل → User: Administrator → API Access → Generate Keys
3. اضغط زر فحص الاتصال (أو نفّذ `test_connection`) للتأكد من نجاح الربط.
4. امنح الموظفين دور **AI Creator User**، والمشرف دور **AI Creator Supervisor**.
5. افتح الصفحة: `/app/ai-creator`

## البنية

```
lib/client.py      طبقة REST لموقع عميل واحد (مقفلة على site)
lib/tools.py       الأدوات المتاحة للنموذج + مستوى خطورة كل أداة
lib/llm.py         طبقة النموذج (Anthropic / OpenAI) — قابلة للتبديل
lib/agent.py       دورة Plan → Risk → Approval → Execute → Verify → Log
lib/connection.py  فحص حالة اتصال المواقع (مجدول كل ساعة)
api.py             نقاط الاتصال للواجهة
ai_creator/page/ai_creator/   واجهة المحادثة داخل Desk
```

## مستويات الخطورة

| المستوى | أمثلة الأدوات | السياسة |
|---|---|---|
| منخفض | inspect_doctype, get_document, list_documents, inspect_customizations, diagnose_permissions | تنفيذ مباشر |
| متوسط | create_document, update_document, add_custom_field, update_print_format | موافقة المشرف |
| مرتفع | submit_document, cancel_document, delete_document, copy_between_clients | موافقة صريحة إلزامية |

## ضوابط أمنية مطبّقة

- الجلسة مقفلة على `client_site` واحد ولا يمكن تغييره بعد الإنشاء (لا من الواجهة ولا من نص النموذج).
- الأسرار مخزنة كـ Password fields ولا تُمرَّر للنموذج إطلاقًا.
- النموذج لا ينفذ SQL ولا Python؛ فقط الأدوات المسجّلة في `tools.py`.
- بيانات العميل تُعامل كـ«بيانات» لا كتعليمات (حماية من Prompt Injection في System Prompt).
- التنفيذ يتوقف عند أول فشل — لا تنفيذ جزئي صامت.
- كل استدعاء أداة يُسجَّل في **AI Action Log** مع المدخلات والقيم قبل/بعد والاستجابة والمدة.
- `copy_between_clients` معطّل افتراضيًا ويحتاج تفعيله يدويًا في AI Settings.

## الحالة: MVP 1

مُنجز: الاتصال بالعملاء، قفل الجلسة، المحادثة، القراءة، Custom Field، Print Format، الموافقات، سجل التدقيق، التحقق الأساسي.

لاحقًا (MVP 2–4): Onboarding، Import مع Preview، Workflows، Reports، تشخيص محاسبي/مخزني، Health Check، Bulk Deployment، Templates & Versions، وربط `press_site` بقاعدة Press عند النقل للسيرفر الأساسي.
