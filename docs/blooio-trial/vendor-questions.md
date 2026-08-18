# Questions for Blooio

Please answer these for Trial, Inbound, Commercial Shared, and Commercial
Dedicated where behavior differs.

1. What exact sender identity does our trial use, and is it shared, pooled, or
   dedicated?
2. Can that identity be manually added to a native iMessage group, and is this
   supported on Inbound?
3. What is the complete native-group inbound payload schema for individual
   sender, participants, rename events, and member changes?
4. Are group, chat, sender, event, provider-message, and message IDs stable? What
   events indicate replacement or relinking?
5. Does Blooio deliver every native group message or only messages directed at
   the Blooio identity?
6. What are the automatic webhook retry schedule, request timeout, retention
   window, maximum attempts, ordering guarantee, and manual replay limit?
7. What are the actual messages-per-minute, concurrent-group, webhook, and
   per-line limits for each plan?
8. For safety and throughput limits, does a group message count once or once per
   recipient?
9. Which plans permit `POST /v4/groups` or other multi-recipient group creation?
   Is it available on Inbound?
10. Does moving from Trial to Inbound, Commercial Shared, or Commercial
    Dedicated preserve the sender identity and existing native group/chat IDs?
11. Does Inbound impose any unpublished contact, group, conversation, or inbound
    message cap?
12. What are the cost, provisioning lead time, and API options for adding inbound
    lines during a sudden traffic increase?
13. Can new inbound lines be provisioned automatically, and can existing groups
    be rebalanced without users recreating them?
14. Which webhook signing, retry, replay, and delivery guarantees are contractual
    rather than beta behavior?
15. Does the free-trial identity accept a brand-new inbound conversation, or
    must the organization/API key send outbound first to establish routing on a
    shared pool?
16. Can you provision a temporary dedicated Inbound line during the trial so we
    can validate the advertised user-first flow before purchasing?
