import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useIAP } from "expo-iap";
import { useRouter } from "expo-router";

import { Button } from "./ui";
import { api } from "@/src/api/client";
import { useFeedback } from "@/src/context/FeedbackContext";
import { PRODUCT_IDS, PLAN_TO_PRODUCT } from "@/src/constants/iap";

// Footer CTA for NATIVE builds (iOS App Store / Google Play).
// Rendered only when IAP_AVAILABLE — never mounts in Expo Go / web.
export function IapPurchaseBar({ plan, priceLabel }: { plan: "monthly" | "yearly"; priceLabel: string }) {
  const { toast, celebrate } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase: any) => {
      try {
        const res = await api.iapVerify({
          platform: Platform.OS,
          product_id: purchase.productId,
          transaction_id: purchase.transactionId ?? purchase.id ?? null,
          purchase_token: purchase.purchaseToken ?? purchase.purchaseTokenAndroid ?? null,
          receipt: purchase.purchaseToken ?? null, // iOS StoreKit2 JWS
        });
        if (res?.valid) {
          await finishTransaction({ purchase, isConsumable: false });
          celebrate({
            title: "Welcome to Premium!",
            desc: "Unlimited generations & watermark-free exports are now unlocked.",
            reward: "Premium activated",
          });
          router.replace("/(tabs)");
        } else {
          toast("Purchase could not be verified", "error");
        }
      } catch (e: any) {
        toast(e?.message || "Verification failed", "error");
      } finally {
        setBusy(false);
      }
    },
    onPurchaseError: (err: any) => {
      setBusy(false);
      if (err?.code === "user-cancelled" || err?.code === "E_USER_CANCELLED") return;
      toast(err?.message || "Purchase failed", "error");
    },
  });

  useEffect(() => {
    if (connected) fetchProducts({ skus: [...PRODUCT_IDS], type: "subs" }).catch(() => {});
  }, [connected, fetchProducts]);

  const buy = async () => {
    setBusy(true);
    const sku = PLAN_TO_PRODUCT[plan];
    try {
      // Android needs an offer token from the fetched subscription (best-effort).
      const sub: any = (subscriptions || []).find((s: any) => s.id === sku || s.productId === sku);
      const offerToken =
        sub?.subscriptionOfferDetailsAndroid?.[0]?.offerToken ??
        sub?.subscriptionOfferDetails?.[0]?.offerToken;
      await requestPurchase({
        request: {
          apple: { sku },
          google: offerToken
            ? { skus: [sku], subscriptionOffers: [{ sku, offerToken }] }
            : { skus: [sku] },
        },
        type: "subs",
      } as any);
    } catch (e: any) {
      setBusy(false);
      toast("Could not start purchase", "error");
    }
  };

  return <Button title={`Continue — ${priceLabel}`} onPress={buy} loading={busy} testID="subscribe-button" />;
}
