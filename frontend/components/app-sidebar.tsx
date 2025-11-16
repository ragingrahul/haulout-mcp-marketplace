"use client";

import * as React from "react";
import {
  Store,
  Settings,
  Wallet,
  DollarSign,
  LayoutDashboard,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// Dashboard navigation data
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive: true,
      items: [],
    },
    {
      title: "Endpoints",
      url: "/dashboard/endpoints",
      icon: Settings,
      items: [
        {
          title: "Create Endpoint",
          url: "/dashboard/endpoints/create",
        },
        {
          title: "Manage Endpoints",
          url: "/dashboard/endpoints/manage",
        },
      ],
    },
    {
      title: "Pricing",
      url: "/dashboard/pricing",
      icon: DollarSign,
      items: [],
    },
    {
      title: "Wallet",
      url: "/dashboard/wallet",
      icon: Wallet,
      items: [],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <Store className="h-6 w-6" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">MCP Marketplace</span>
            <span className="text-xs text-muted-foreground">Sui Network</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
