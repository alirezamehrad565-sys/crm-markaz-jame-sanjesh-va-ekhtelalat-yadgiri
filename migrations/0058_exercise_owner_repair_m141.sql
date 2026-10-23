UPDATE exercises
   SET created_by = '00000000-0000-4000-8000-000000000105',
       updated_at = datetime('now')
 WHERE id IN ('04fba0fa-f355-41ea-a921-45b75e53a68c',
              '921c61fd-8fc1-48ab-a38c-5faf342b141a')
   AND created_by = '00000000-0000-4000-8000-000000000102';

INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes)
SELECT 'm141-owner-repair-04fba0fa',
       'a0000000-0000-4000-8000-000000000001',
       'exercise.reassigned',
       'exercise',
       '04fba0fa-f355-41ea-a921-45b75e53a68c',
       '{"from":"00000000-0000-4000-8000-000000000102","to":"00000000-0000-4000-8000-000000000105","reason":"m141 data repair — بازگرداندن مالکیت به مولف (الهه زمان زارعی) پس از بازگشت‌های بی‌صدای PATCH پیش از m140"}'
 WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE id = 'm141-owner-repair-04fba0fa');

INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes)
SELECT 'm141-owner-repair-921c61fd',
       'a0000000-0000-4000-8000-000000000001',
       'exercise.reassigned',
       'exercise',
       '921c61fd-8fc1-48ab-a38c-5faf342b141a',
       '{"from":"00000000-0000-4000-8000-000000000102","to":"00000000-0000-4000-8000-000000000105","reason":"m141 data repair — بازگرداندن مالکیت به مولف (الهه زمان زارعی) پس از بازگشت‌های بی‌صدای PATCH پیش از m140"}'
 WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE id = 'm141-owner-repair-921c61fd');
