import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  testTemplate,
  listTriggers,
  createTrigger,
  getTrigger,
  updateTrigger,
  deleteTrigger,
  toggleTrigger,
  listAvailableEvents,
  listNotificationLogs,
  listMyNotifications,
  markNotificationRead,
  unreadCount,
} from '../../controllers/admin/notifications.controller';

const router = Router();

// Templates
router.get('/admin/notification-templates', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listTemplates);
router.post('/admin/notification-templates', authenticate, authorize('SuperAdmin', 'Operations'), createTemplate);
router.get('/admin/notification-templates/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getTemplate);
router.put('/admin/notification-templates/:id', authenticate, authorize('SuperAdmin', 'Operations'), updateTemplate);
router.delete('/admin/notification-templates/:id', authenticate, authorize('SuperAdmin', 'Operations'), deleteTemplate);
router.post('/admin/notification-templates/:id/test', authenticate, authorize('SuperAdmin', 'Operations'), testTemplate);

// Triggers
router.get('/admin/notification-triggers/events', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listAvailableEvents);
router.get('/admin/notification-triggers', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listTriggers);
router.post('/admin/notification-triggers', authenticate, authorize('SuperAdmin', 'Operations'), createTrigger);
router.get('/admin/notification-triggers/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getTrigger);
router.put('/admin/notification-triggers/:id', authenticate, authorize('SuperAdmin', 'Operations'), updateTrigger);
router.delete('/admin/notification-triggers/:id', authenticate, authorize('SuperAdmin', 'Operations'), deleteTrigger);
router.patch('/admin/notification-triggers/:id/toggle', authenticate, authorize('SuperAdmin', 'Operations'), toggleTrigger);

// Logs
router.get('/admin/notification-logs', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listNotificationLogs);

// In-App
router.get('/admin/notifications', authenticate, listMyNotifications);
router.patch('/admin/notifications/:id/read', authenticate, markNotificationRead);
router.get('/admin/notifications/unread-count', authenticate, unreadCount);

export default router;
