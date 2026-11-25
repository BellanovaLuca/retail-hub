import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, vapidSubject } from "./push-endpoint";

describe("indirizzi delle sottoscrizioni push", () => {
  it("accetta i servizi push dei browser", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://web.push.apple.com/QOabc",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://push.services.mozilla.com/wpush/v1/x",
      "https://autopush.prod.mozaws.net/wpush/v2/x",
      "https://db5p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("rifiuta host qualsiasi, http, porte e credenziali", () => {
    for (const endpoint of [
      "https://evil.example/hook",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com/x",
      "https://mozilla.com.evil.example/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pw@fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "non-un-url",
      "",
      `https://fcm.googleapis.com/${"a".repeat(1000)}`,
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});

describe("subject VAPID", () => {
  it("usa solo l'indirizzo di EMAIL_FROM", () => {
    expect(vapidSubject("Staff Cordusio <noreply@example.it>")).toBe("mailto:noreply@example.it");
    expect(vapidSubject("noreply@example.it")).toBe("mailto:noreply@example.it");
    expect(vapidSubject("  noreply@example.it ")).toBe("mailto:noreply@example.it");
  });

  it("senza un indirizzo valido usa quello di riserva", () => {
    expect(vapidSubject(undefined)).toBe("mailto:staff@example.com");
    expect(vapidSubject("Staff Cordusio")).toBe("mailto:staff@example.com");
  });
});
