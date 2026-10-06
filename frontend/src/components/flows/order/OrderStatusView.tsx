"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/api/useApiErrorMessage";
import { sectionCounts } from "@/lib/flows/progress";
import { resolveCheckoutUrl } from "@/lib/flows/report";
import { formatDate, formatMoney } from "@/lib/format";
import type { CheckoutOut, OrderStatusOut } from "@/lib/types";
import { bidiIsolate } from "@/lib/flows/text";
import { ContactLine } from "../ContactLine";
import { DownloadReport } from "../DownloadReport";
import { FlowHero, FlowSurface } from "../FlowHero";
import { useOrderToken, useSearchParam } from "../hooks";
import { StatusCard } from "../StatusCard";
import { ExpiryCountdown } from "./ExpiryCountdown";
import { ProgressTracker } from "./ProgressTracker";
import { SignsSummary } from "./SignsSummary";
import { useOrderStatus } from "./useOrderStatus";

export interface OrderStatusViewProps {
  orderId: string;
  /** Editable company email (site content), for help lines. */
  contactEmail: string;
  /** public-config report_access_hours. */
  accessHours: number;
}

const CONFIRM_TIMEOUT_MS = 2 * 60_000;

/** Short, non-secret reference shown to the visitor ("Order 1A2B3C4D"). */
const shortRef = (orderId: string) => orderId.replace(/-/g, "").slice(0, 8).toUpperCase();

/**
 * Order status page: token from localStorage, polling while the report is being created,
 * download once ready, and clear messages for every other state.
 */
export function OrderStatusView({ orderId, contactEmail, accessHours }: OrderStatusViewProps) {
  const t = useTranslations("order");
  const tDesc = useTranslations("orderStatusDescription");
  const token = useOrderToken(orderId);
  const paidParam = useSearchParam("paid");
  const cancelledParam = useSearchParam("cancelled");
  const { snapshot, refresh } = useOrderStatus(orderId, token, paidParam === "1");
  const order = snapshot.order;

  let announcement = "";
  if (order) {
    const { sections_done: done, sections_total: total } = sectionCounts(order);
    switch (order.status) {
      case "paid":
        announcement = t("progress.announce.paid");
        break;
      case "queued":
        announcement = t("progress.announce.queued");
        break;
      case "generating":
        announcement =
          done < total
            ? t("progress.announce.writing", { current: done + 1, total })
            : t("progress.announce.design");
        break;
      case "ready":
        announcement = t("progress.announce.ready");
        break;
      default:
        announcement = tDesc(order.status);
    }
  }

  let view: ReactNode;
  if (token === undefined || (token && snapshot.phase === "loading")) {
    view = <LoadingView retrying={snapshot.failures > 0} />;
  } else if (token === null) {
    view = (
      <MessageView title={t("noToken.title")} tone="info" contactEmail={contactEmail}>
        {t("noToken.body")}
      </MessageView>
    );
  } else if (snapshot.phase === "notFound" || !order) {
    view = (
      <MessageView
        title={t("notFound.title")}
        tone="warning"
        contactEmail={contactEmail}
        actions={<HomeActions />}
      >
        {t("notFound.body")}
      </MessageView>
    );
  } else {
    view = (
      <OrderView
        order={order}
        token={token}
        refresh={refresh}
        cancelled={cancelledParam === "1"}
        confirming={paidParam === "1"}
        retrying={snapshot.failures > 0}
        contactEmail={contactEmail}
        accessHours={accessHours}
      />
    );
  }

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      {view}
    </>
  );
}

function LoadingView({ retrying }: { retrying: boolean }) {
  const t = useTranslations("order");
  return (
    <>
      <FlowHero overlap eyebrow={t("eyebrow")} title={t("loading")} />
      <FlowSurface>
        <div
          aria-busy="true"
          className="mx-auto grid min-h-72 max-w-2xl place-items-center rounded-2xl border border-line bg-card shadow-lift"
        >
          <div className="flex flex-col items-center gap-4 text-muted">
            <Spinner size="lg" label={t("loading")} />
            {retrying ? <p className="text-sm">{t("retrying")}</p> : null}
          </div>
        </div>
      </FlowSurface>
    </>
  );
}

function HomeActions() {
  const tc = useTranslations("common");
  const t = useTranslations("order");
  return (
    <>
      <Button href="/reading" icon={<ArrowIcon />}>
        {t("newOrder")}
      </Button>
      <Button href="/" variant="outline">
        {tc("backHome")}
      </Button>
    </>
  );
}

function MessageView({
  title,
  tone,
  children,
  actions,
  contactEmail,
  below,
}: {
  title: string;
  tone: "info" | "success" | "warning" | "error" | "neutral";
  children: ReactNode;
  actions?: ReactNode;
  contactEmail: string;
  below?: ReactNode;
}) {
  const t = useTranslations("order");
  return (
    <>
      <FlowHero overlap eyebrow={t("eyebrow")} title={title} />
      <FlowSurface>
        <StatusCard tone={tone} actions={actions} footer={<ContactLine email={contactEmail} />}>
          {children}
        </StatusCard>
        {below ? <div className="mx-auto mt-8 max-w-2xl">{below}</div> : null}
      </FlowSurface>
    </>
  );
}

function OrderMeta({ order }: { order: OrderStatusOut }) {
  const tf = useTranslations("flows");
  const t = useTranslations("order");
  const locale = useLocale();
  return (
    <p className="mt-6 text-center text-xs text-muted">
      <span className="font-medium tracking-wide">
        {tf("orderRef", { ref: bidiIsolate(shortRef(order.order_id)) })}
      </span>
      <span aria-hidden="true" className="mx-2 text-ornament">
        ✦
      </span>
      {t("placedOn", { date: formatDate(order.created_at, locale, { dateStyle: "medium" }) })}
    </p>
  );
}

function OrderView({
  order,
  token,
  refresh,
  cancelled,
  confirming,
  retrying,
  contactEmail,
  accessHours,
}: {
  order: OrderStatusOut;
  token: string;
  refresh: () => void;
  cancelled: boolean;
  confirming: boolean;
  retrying: boolean;
  contactEmail: string;
  accessHours: number;
}) {
  const t = useTranslations("order");
  const locale = useLocale();
  const apiErrorMessage = useApiErrorMessage();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // Back from checkout (?paid=1) but still unpaid after a while: offer the payment button again.
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);
  const awaitingConfirmation = confirming && order.status === "awaiting_payment";
  useEffect(() => {
    if (!awaitingConfirmation) return;
    const timer = setTimeout(() => setConfirmTimedOut(true), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingConfirmation]);

  const retryNote = retrying ? (
    <p role="status" className="mt-4 text-center text-sm text-muted">
      {t("retrying")}
    </p>
  ) : null;

  async function completePayment() {
    setPaying(true);
    setPayError(null);
    try {
      const res = await api.post<CheckoutOut>(
        `/orders/${encodeURIComponent(order.order_id)}/checkout`,
        undefined,
        { headers: { "X-Order-Token": token } },
      );
      window.location.assign(resolveCheckoutUrl(res.checkout_url, window.location.origin));
    } catch (err) {
      setPaying(false);
      if (isApiError(err) && err.code === "order_not_payable") {
        setPayError(t("awaiting.notPayable"));
        refresh();
      } else {
        setPayError(apiErrorMessage(err));
      }
    }
  }

  const expiredView = (
    <MessageView
      title={t("expired.title")}
      tone="neutral"
      contactEmail={contactEmail}
      actions={<HomeActions />}
    >
      {t("expired.body", { hours: accessHours })}
    </MessageView>
  );

  switch (order.status) {
    case "awaiting_payment": {
      if (confirming && !confirmTimedOut) {
        return (
          <>
            <FlowHero
              overlap
              eyebrow={t("eyebrow")}
              title={t("awaiting.confirmingTitle")}
              lead={t("awaiting.confirmingBody")}
            >
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" className="text-ivory" />
              </div>
            </FlowHero>
            <FlowSurface>
              <SignsSummary signs={order.signs} className="mx-auto max-w-2xl shadow-lift" />
              {retryNote}
              <OrderMeta order={order} />
            </FlowSurface>
          </>
        );
      }
      return (
        <>
          <FlowHero
            overlap
            eyebrow={t("eyebrow")}
            title={t("awaiting.title")}
            lead={t("awaiting.body")}
          >
            <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4">
              {cancelled ? (
                <Alert tone="info" className="w-full text-start">
                  {t("awaiting.cancelled")}
                </Alert>
              ) : null}
              <p className="text-mist">
                {t("amountDue", {
                  amount: bidiIsolate(formatMoney(order.amount_cents, order.currency, locale)),
                })}
              </p>
              <Button
                size="lg"
                onClick={completePayment}
                loading={paying}
                icon={<ArrowIcon />}
                className="max-sm:w-full"
              >
                {t("awaiting.button")}
              </Button>
              {payError ? (
                <Alert tone="error" className="w-full text-start">
                  {payError}
                </Alert>
              ) : null}
            </div>
          </FlowHero>
          <FlowSurface>
            <SignsSummary signs={order.signs} className="mx-auto max-w-2xl shadow-lift" />
            <OrderMeta order={order} />
          </FlowSurface>
        </>
      );
    }
    case "paid":
    case "queued":
    case "generating":
      return (
        <>
          <FlowHero
            overlap
            eyebrow={t("eyebrow")}
            title={t("progress.title")}
            lead={t("progress.lead")}
          />
          <FlowSurface size="default">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
              <ProgressTracker order={order} className="shadow-lift" />
              <SignsSummary signs={order.signs} className="shadow-lift" />
            </div>
            {retryNote}
            <SlowNotice since={order.paid_at ?? order.created_at} />
            <OrderMeta order={order} />
          </FlowSurface>
        </>
      );
    case "ready":
      // The access window closed before the cleanup job marked the order expired.
      if (!order.download_available) return expiredView;
      return (
        <>
          <FlowHero
            overlap
            eyebrow={t("eyebrow")}
            title={t("ready.title")}
            lead={t.rich("ready.lead", {
              brand: (chunks) => (
                <span lang="en" className="font-sans">
                  {chunks}
                </span>
              ),
            })}
          >
            <div className="mt-9 flex flex-col items-center gap-5">
              <DownloadReport orderId={order.order_id} token={token} onProblem={() => refresh()} />
              {order.access_expires_at ? (
                <ExpiryCountdown expiresAt={order.access_expires_at} onExpired={refresh} />
              ) : null}
              <p className="max-w-md text-sm text-mist">
                {t("ready.emailed", { email: bidiIsolate(order.email_masked) })}
              </p>
            </div>
          </FlowHero>
          <FlowSurface>
            <SignsSummary signs={order.signs} className="mx-auto max-w-2xl shadow-lift" />
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted">
              {t("ready.keepCopy", { hours: accessHours })}
            </p>
            <OrderMeta order={order} />
          </FlowSurface>
        </>
      );
    case "generation_failed":
      return (
        <MessageView
          title={t("failed.title")}
          tone="neutral"
          contactEmail={contactEmail}
          below={<SignsSummary signs={order.signs} className="shadow-card" />}
        >
          {t("failed.body")}
        </MessageView>
      );
    case "expired":
      return expiredView;
    case "refunded":
      return (
        <MessageView
          title={t("refunded.title")}
          tone="info"
          contactEmail={contactEmail}
          actions={<HomeActions />}
        >
          {t("refunded.body")}
        </MessageView>
      );
    case "abandoned":
      return (
        <MessageView
          title={t("abandoned.title")}
          tone="info"
          contactEmail={contactEmail}
          actions={<HomeActions />}
        >
          {t("abandoned.body")}
        </MessageView>
      );
  }
}

const SLOW_AFTER_MS = 10 * 60_000;

/** After ~10 minutes in progress, reassure the visitor that they can leave. */
function SlowNotice({ since }: { since: string }) {
  const t = useTranslations("order.progress");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const start = Date.parse(since);
    const wait = Number.isNaN(start) ? SLOW_AFTER_MS : start + SLOW_AFTER_MS - Date.now();
    const timer = setTimeout(() => setSlow(true), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [since]);
  if (!slow) return null;
  return (
    <Alert tone="info" className="mx-auto mt-6 max-w-2xl">
      {t("slow")}
    </Alert>
  );
}
