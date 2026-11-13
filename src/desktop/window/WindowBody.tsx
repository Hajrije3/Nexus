"use client";

import { memo, Suspense, useState } from "react";
import { WindowContext } from "@/system/sdk/window";
import { processTable } from "@/system/runtime/process-store";
import { lifecycle } from "@/system/runtime/lifecycle";
import type { AppId, InstanceId } from "@/system/runtime/types";
import type { WindowId } from "@/system/window-manager/types";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { evictAppComponent, getAppComponent } from "./app-loader";

interface WindowBodyProps {
  windowId: WindowId;
  instanceId: InstanceId;
  appId: AppId;
  appName: string;
}

const EMPTY_ARGS = Object.freeze({});

/**
 * Application content. Memoised on identity props only, so focus changes,
 * moves and resizes of the frame never re-render the app.
 */
export const WindowBody = memo(function WindowBody({ windowId, instanceId, appId, appName }: WindowBodyProps) {
  // Created once per window; replaced (fresh chunk load + remount) on "Reopen".
  const [App, setApp] = useState(() => getAppComponent(appId));
  const args = processTable.get(instanceId)?.args ?? EMPTY_ARGS;
  const ctx = { windowId, instanceId };

  return (
    <WindowContext.Provider value={ctx}>
      <AppErrorBoundary
        appName={appName}
        onClose={() => lifecycle.closeWindow(windowId)}
        onRestart={() => {
          evictAppComponent(appId);
          setApp(() => getAppComponent(appId));
        }}
      >
        <Suspense fallback={<WindowLoading />}>
          <App windowId={windowId} instanceId={instanceId} args={args} />
        </Suspense>
      </AppErrorBoundary>
    </WindowContext.Provider>
  );
});

function WindowLoading() {
  return (
    <div className="grid h-full place-items-center" role="status" aria-label="Loading application">
      <div className="size-4 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg/70" />
    </div>
  );
}
