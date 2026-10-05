"""Paid report delivery: PDF rendering, private storage, download API, email and cleanup.

Entry points used by other modules:

- ``app.reports.service.build_report(db, order)``: render + store the PDF, order -> ready, queue the email.
- ``app.reports.service.enqueue_report_email(db, order, resend=True)``: admin "resend email".
- ``app.reports.service.extend_report_access(db, order, hours)``: admin "extend access".
- ``app.reports.jobs.handle_send_report_email`` / ``handle_cleanup``: worker handlers (see app.jobs.registry).
- ``app.reports.router.router``: ``GET /api/v1/reports/{order_id}/download``.

Preview the design without an order: ``python -m app.reports.preview --locale ar --out /tmp/report.pdf``.
"""
