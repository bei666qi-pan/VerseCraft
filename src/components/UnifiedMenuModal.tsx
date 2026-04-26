"use client";

import { Activity, useEffect } from "react";
import { useGameStore, type ActiveMenu } from "@/store/useGameStore";

type VisibleMenuTab = never;

export const VISIBLE_MENU_TABS: readonly VisibleMenuTab[] = [];

function isRetainedPlayPanel(menu: ActiveMenu): boolean {
  return menu === "character" || menu === "codex" || menu === "settings";
}

interface UnifiedMenuModalProps {
  activeMenu: ActiveMenu;
  onClose: () => void;
  audioMuted: boolean;
  onToggleMute: () => void;
  onRequestExit: () => void;
}

export function UnifiedMenuModal(props: UnifiedMenuModalProps) {
  const { activeMenu } = props;
  void props.audioMuted;
  void props.onClose;
  void props.onRequestExit;
  void props.onToggleMute;
  useEffect(() => {
    if (activeMenu !== null && !isRetainedPlayPanel(activeMenu)) {
      useGameStore.getState().setActiveMenu(null);
    }
  }, [activeMenu]);

  return (
    <Activity mode="hidden">
      <div id="unified-menu-content" hidden aria-hidden="true" />
    </Activity>
  );
}
