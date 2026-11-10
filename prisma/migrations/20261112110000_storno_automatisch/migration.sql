-- Pay-per-Lead: je Bezug einstellbar, ob Reklamationen immer automatisch anerkannt werden (Standard aus = bisherige Regel).
ALTER TABLE "LeadSubscription" ADD COLUMN "stornoAutoApprove" BOOLEAN NOT NULL DEFAULT false;
