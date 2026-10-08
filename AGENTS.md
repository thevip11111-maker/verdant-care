<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Care reminders live in `care_reminders`; a 15-minute pg_cron job calls `/api/public/cron/reminders` (token in `app_private.config`) which sends web push via VAPID — why: works with the app closed, without a third-party service.
- NASA POWER/FIRMS are fetched in `src/lib/nasa.functions.ts` server-side — why: keeps the FIRMS key secret.
- Plant and scan photos go in the private `plant-photos` bucket under `<userId>/` and are shown via signed URLs — why: public buckets are blocked.
