"use client";

import * as React from "react";

import { SearchForm } from "@/components/search-form";
import { VersionSwitcher } from "@/components/version-switcher";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";
import {
  ChevronRightIcon,
  LayoutDashboard,
  Activity,
  Bot,
  CircleUser,
  Users,
  Rocket,
  Download,
  FolderTree,
  BookOpen,
  GitPullRequest
} from "lucide-react";
import { NavUser } from "./nav-user";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg"
  },
  mainMenu: [
    {
      title: "Dashboard",
      url: "#",
      icon: LayoutDashboard
    },
    {
      title: "Activity",
      url: "#",
      icon: Activity
    },
    {
      title: "Agent Config",
      url: "#",
      icon: Bot
    },
    {
      title: "Accounts",
      url: "#",
      icon: CircleUser
    },
    {
      title: "Communities",
      url: "#",
      icon: Users
    }
  ],
  navMain: [
    {
      title: "Getting Started",
      url: "#",
      icon: Rocket,
      items: [
        {
          title: "Installation",
          url: "#",
          icon: Download
        },
        {
          title: "Project Structure",
          url: "#",
          icon: FolderTree
        }
      ]
    }
    // {
    //   title: "Community",
    //   url: "#",
    //   icon: Users,
    //   items: [
    //     {
    //       title: "Contribution Guide",
    //       url: "#",
    //       icon: GitPullRequest
    //     }
    //   ]
    // }
  ]
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <a href='#'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  A
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-medium'>Acme Inc</span>
                  <span className='truncate text-xs'>Enterprise</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className='gap-0'>
        {/* Main menu — rendered before the collapsible groups. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.mainMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* We create a collapsible SidebarGroup for each parent. */}
        {data.navMain.map((item) => (
          <Collapsible key={item.title} title={item.title} defaultOpen={false} className='group/collapsible'>
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className='group/label text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              >
                <CollapsibleTrigger>
                  <item.icon className='mr-2 size-4' />
                  {item.title}{" "}
                  <ChevronRightIcon className='ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90' />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {item.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <a href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarRail />

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
