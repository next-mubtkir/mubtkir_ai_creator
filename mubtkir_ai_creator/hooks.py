app_name = "mubtkir_ai_creator"
app_title = "Mubtkir AI Creator"
app_publisher = "MUBTKIR"
app_description = "منصة مركزية بالذكاء الاصطناعي لإدارة ودعم وتخصيص حسابات ERPNext للعملاء عبر API"
app_email = "info@mubtkir.com"
app_license = "MIT"

# الأدوار المطلوبة: AI Creator User (تشغيل)، AI Creator Supervisor (اعتماد العمليات الحساسة)

after_install = "mubtkir_ai_creator.install.after_install"

scheduler_events = {
    "cron": {
        # فحص حالة الاتصال بمواقع العملاء كل ساعة
        "0 * * * *": [
            "mubtkir_ai_creator.lib.connection.ping_all_sites"
        ],
        # تنفيذ المهام المجدولة كل دقيقة
        "* * * * *": [
            "mubtkir_ai_creator.lib.scheduler.execute_scheduled_tasks"
        ]
    }
}

app_include_js = ["/assets/mubtkir_ai_creator/js/json_renderer.js"]
app_include_css = []
