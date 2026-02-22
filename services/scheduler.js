const cron = require('node-cron');
const { clearExpiredOverrides, getCurrentTimeSlot, ensureDB } = require('./statusEngine');

let lastSlotId = null;

/**
 * Initialize the scheduler for auto-reset functionality
 */
function initScheduler() {
    // Run every minute to check for slot changes and clear expired overrides
    cron.schedule('* * * * *', async () => {
        try {
            await ensureDB();
            const currentSlot = await getCurrentTimeSlot();
            const currentSlotId = currentSlot?.id || null;

            // Detect slot change
            if (currentSlotId !== lastSlotId) {
                console.log(`⏰ Time slot changed: ${lastSlotId} → ${currentSlotId}`);
                lastSlotId = currentSlotId;

                // Clear any expired overrides
                const cleared = await clearExpiredOverrides();
                if (cleared > 0) {
                    console.log(`🔄 Cleared ${cleared} expired status overrides`);
                }
            }
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    });

    console.log('📅 Auto-reset scheduler initialized');
}

module.exports = { initScheduler };

