/* AIFirstMart mock, platform-only build: removes any training affordance the platform screens still draw
 * (practice banners, lesson launchers, coaching buttons), so the mock reads as the product itself. */
(() => {
'use strict';
const SEL = '#gt, #gt-launch, .training-fab, [data-training-fab], [data-training-summary], [data-training-open], [data-training-dashboard], [data-teacher-orientation], .teacher-home, .process-coach, .movable-training, [data-coach], [data-action-lab], [data-voice-coach], .lab-panel, [data-nav="records"], #records';
function clean() { document.querySelectorAll(SEL).forEach(el => el.remove()); }
new MutationObserver(clean).observe(document.body, {childList: true, subtree: true});
clean();
})();
