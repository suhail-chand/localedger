export type IcsDeliveryResult = "shared" | "downloaded" | "cancelled";

interface ShareNavigator {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

function downloadIcs(content: string, fileName: string): void {
  const blob = new Blob([content], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function deliverIcsFile(
  content: string,
  fileName = "localedger-reminders.ics",
): Promise<IcsDeliveryResult> {
  const shareNavigator = navigator as Navigator & ShareNavigator;
  if (typeof File === "undefined") {
    downloadIcs(content, fileName);
    return "downloaded";
  }

  const file = new File([content], fileName, {
    type: "text/calendar",
  });
  const shareData: ShareData = {
    files: [file],
  };

  try {
    if (
      shareNavigator.canShare &&
      shareNavigator.share &&
      shareNavigator.canShare(shareData)
    ) {
      await shareNavigator.share(shareData);
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
  }

  downloadIcs(content, fileName);
  return "downloaded";
}
