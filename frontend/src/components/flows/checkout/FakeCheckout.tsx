"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/api/useApiErrorMessage";
import { formatMoney } from "@/lib/format";
import type { FakePaymentComplete, OrderStatusOut } from "@/lib/types";
import { bidiIsolate } from "@/lib/flows/text";
import { useOrderToken, useSearchParam } from "../hooks";

type Load =
  | { state: "loading" }
  | { state: "ready"; order: OrderStatusOut }
  | { state: "notFound" }
  | { state: "error"; error: unknown };

/**
 * Development / test payment page for the `fake` provider: shows the order and completes the
 * payment through POST /payments/fake/complete. Reached by a full page load from the order form.
 */
export function FakeCheckout({ available }: { available: boolean }) {
  const t = useTranslations("checkout");
  const orderId = useSearchParam("order");
  const token = useOrderToken(orderId ?? "");

  if (!available) {
    return (
      <CheckoutShell>
        <Message title={t("unavailableTitle")} body={t("unavailableBody")}>
          {orderId ? (
            <Button href={`/order/${encodeURIComponent(orderId)}`} icon={<ArrowIcon />}>
              {t("viewOrder")}
            </Button>
          ) : null}
        </Message>
      </CheckoutShell>
    );
  }
  if (orderId === undefined || token === undefined) {
    return (
      <CheckoutShell>
        <LoadingBlock />
      </CheckoutShell>
    );
  }
  if (!orderId) {
    return (
      <CheckoutShell>
        <Message body={t("missingOrder")}>
          <Button href="/reading" icon={<ArrowIcon />}>
            {t("newOrder")}
          </Button>
        </Message>
      </CheckoutShell>
    );
  }
  if (!token) {
    return (
      <CheckoutShell>
        <Message title={t("noTokenTitle")} body={t("noTokenBody")}>
          <Button href="/reading" icon={<ArrowIcon />}>
            {t("newOrder")}
          </Button>
        </Message>
      </CheckoutShell>
    );
  }
  return <CheckoutSummary orderId={orderId} token={token} />;
}

function CheckoutSummary({ orderId, token }: { orderId: string; token: string }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiErrorMessage = useApiErrorMessage();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [paying, setPaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<OrderStatusOut>(`/orders/${encodeURIComponent(orderId)}`, {
        headers: { "X-Order-Token": token },
        signal: controller.signal,
      })
      .then((order) => setLoad({ state: "ready", order }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoad(
          isApiError(error) && error.isNotFound ? { state: "notFound" } : { state: "error", error },
        );
      });
    return () => controller.abort();
  }, [orderId, token, attempt]);

  const orderUrl = (query: string) => `/${locale}/order/${encodeURIComponent(orderId)}${query}`;

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      const body: FakePaymentComplete = { order_id: orderId, access_token: token };
      await api.post("/payments/fake/complete", body);
      setLeaving(true);
      window.location.assign(orderUrl("?paid=1"));
    } catch (err) {
      setPaying(false);
      setPayError(apiErrorMessage(err));
    }
  }

  function cancel() {
    setLeaving(true);
    window.location.assign(orderUrl("?cancelled=1"));
  }

  if (load.state === "loading") {
    return (
      <CheckoutShell>
        <LoadingBlock />
      </CheckoutShell>
    );
  }
  if (load.state === "notFound") {
    return (
      <CheckoutShell>
        <Message title={t("noTokenTitle")} body={t("noTokenBody")}>
          <Button href="/reading" icon={<ArrowIcon />}>
            {t("newOrder")}
          </Button>
        </Message>
      </CheckoutShell>
    );
  }
  if (load.state === "error") {
    return (
      <CheckoutShell>
        <div className="space-y-5 py-4">
          <Alert tone="error">{apiErrorMessage(load.error)}</Alert>
          <Button
            variant="outline"
            onClick={() => {
              setLoad({ state: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            {tc("tryAgain")}
          </Button>
        </div>
      </CheckoutShell>
    );
  }

  const { order } = load;
  const amount = formatMoney(order.amount_cents, order.currency, locale);
  if (order.status !== "awaiting_payment") {
    return (
      <CheckoutShell>
        <Message body={t("notPayable")}>
          <Button href={`/order/${encodeURIComponent(orderId)}`} icon={<ArrowIcon />}>
            {t("viewOrder")}
          </Button>
        </Message>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell>
      <h2 className="font-serif text-2xl font-semibold text-fg">{t("summaryTitle")}</h2>
      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-parchment/50 px-5">
        <div className="flex items-baseline justify-between gap-4 py-3.5">
          <dt className="text-fg">{t("item")}</dt>
          <dd className="tabular-nums" dir="ltr">
            {amount}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5">
          <dt className="text-muted">{t("reportFor")}</dt>
          <dd className="min-w-0 break-all text-fg" dir="ltr">
            {order.email_masked}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-4">
          <dt className="font-semibold text-fg">{t("total")}</dt>
          <dd className="font-display text-2xl font-semibold text-gold-deep tabular-nums" dir="ltr">
            {amount}
          </dd>
        </div>
      </dl>
      {payError ? (
        <Alert tone="error" className="mt-5">
          {payError}
        </Alert>
      ) : null}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={cancel} disabled={paying || leaving}>
          {t("cancel")}
        </Button>
        <Button onClick={pay} loading={paying || leaving} icon={<ArrowIcon />}>
          {paying || leaving ? t("paying") : t("pay", { amount: bidiIsolate(amount) })}
        </Button>
      </div>
      <div aria-live="polite" className="sr-only">
        {paying ? t("paying") : ""}
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("checkout");
  return (
    <Card padding="none" className="mx-auto max-w-xl overflow-hidden shadow-lift">
      <div
        role="note"
        className="border-b border-warning/30 bg-warning-soft px-6 py-4 text-center [background-image:repeating-linear-gradient(135deg,transparent_0_14px,rgb(133_84_11/0.05)_14px_28px)]"
      >
        <p className="font-display text-sm font-bold tracking-[0.16em] text-warning uppercase rtl:tracking-normal">
          {t("banner")}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{t("bannerBody")}</p>
      </div>
      <div className="px-6 py-8 sm:px-9">{children}</div>
    </Card>
  );
}

function LoadingBlock() {
  const tc = useTranslations("common");
  return (
    <div className="grid min-h-56 place-items-center text-muted">
      <Spinner size="lg" label={tc("loading")} />
    </div>
  );
}

function Message({
  title,
  body,
  children,
}: {
  title?: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-2 text-center">
      {title ? <h2 className="font-serif text-2xl font-semibold text-fg">{title}</h2> : null}
      <p className="mx-auto mt-2 max-w-md leading-relaxed text-muted">{body}</p>
      {children ? <div className="mt-6 flex justify-center">{children}</div> : null}
    </div>
  );
}
