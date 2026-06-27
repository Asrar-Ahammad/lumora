"use server";

import webpush from "web-push";
import { auth } from "@clerk/nextjs/server";

// Set up VAPID details
webpush.setVapidDetails(
  "mailto:support@lumora.cloud",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// In-memory store for active subscriptions, keyed by Clerk userId.
// In production, you would store this subscription in a persistent database table.
// Using a global map declared on the global object ensures it survives Next.js dev hot-reloads.
const globalForSubscriptions = global as unknown as {
  subscriptionsMap?: Map<string, any>;
};

if (!globalForSubscriptions.subscriptionsMap) {
  globalForSubscriptions.subscriptionsMap = new Map<string, any>();
}

const subscriptions = globalForSubscriptions.subscriptionsMap;

export async function subscribeUser(sub: any) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    subscriptions.set(userId, sub);
    return { success: true };
  } catch (error) {
    console.error("Error subscribing user:", error);
    return { success: false, error: "Failed to subscribe" };
  }
}

export async function unsubscribeUser() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    subscriptions.delete(userId);
    return { success: true };
  } catch (error) {
    console.error("Error unsubscribing user:", error);
    return { success: false, error: "Failed to unsubscribe" };
  }
}

export async function getSubscriptionStatus() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized", subscribed: false };
    }

    const sub = subscriptions.get(userId);
    return { success: true, subscribed: !!sub };
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return { success: false, error: "Failed to check subscription", subscribed: false };
  }
}

export async function sendNotification(message: string) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const subscription = subscriptions.get(userId);
    if (!subscription) {
      return { success: false, error: "No subscription available. Please subscribe first." };
    }

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "Lumora Secure Drive",
        body: message,
        icon: "/icon-192x192.png",
        badge: "/badge.png",
      })
    );
    return { success: true };
  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return { success: false, error: error.message || "Failed to send notification" };
  }
}
