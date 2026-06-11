"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  BookOpen,
  CircleUser,
  Users,
  Target,
  Lightbulb,
  MessagesSquare,
  Settings,
  Gauge,
  Rocket,
  Download,
  FolderTree
} from "lucide-react";
import { NavUser } from "./nav-user";

const data = {
  mainMenu: [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard
    },

    {
      title: "Activity",
      url: "/activity",
      icon: Activity
    },
    {
      title: "Agent Config",
      url: "/agent-config",
      icon: Bot
    },
    {
      title: "Accounts",
      url: "/accounts",
      icon: CircleUser
    },
    {
      title: "Communities",
      url: "/communities",
      icon: Users
    },
    {
      title: "Leads",
      url: "/leads",
      icon: Target
    },
    {
      title: "Learnings",
      url: "/learnings",
      icon: Lightbulb
    },
    {
      title: "Conversations",
      url: "/conversations",
      icon: MessagesSquare
    },
    {
      title: "Usage",
      url: "/usage",
      icon: Gauge
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings
    },
    {
      title: "How to Use",
      url: "/how-to",
      icon: BookOpen
    }
  ],
  navMain: [
    // {
    //   title: "Getting Started",
    //   url: "#",
    //   icon: Rocket,
    //   items: [
    //     {
    //       title: "Installation",
    //       url: "#",
    //       icon: Download
    //     },
    //     {
    //       title: "Project Structure",
    //       url: "#",
    //       icon: FolderTree
    //     }
    //   ]
    // }
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
  const pathname = usePathname();

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  O
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-medium'>Orbis</span>
                  <span className='truncate text-xs'>AI Agent Platform</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className='gap-0'>
        {/* Main menu — rendered before the collapsible groups. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className='gap-2'>
              {data.mainMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* {data.navMain.map((item) => (
          // <Collapsible key={item.title} title={item.title} defaultOpen={false} className='group/collapsible'>
          //   <SidebarGroup>
          //     <SidebarGroupLabel
          //       asChild
          //       className='group/label text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          //     >
          //       <CollapsibleTrigger>
          //         <item.icon className='mr-2 size-4' />
          //         {item.title}{" "}
          //         <ChevronRightIcon className='ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90' />
          //       </CollapsibleTrigger>
          //     </SidebarGroupLabel>
          //     <CollapsibleContent>
          //       <SidebarGroupContent>
          //         <SidebarMenu>
          //           {item.items.map((item) => (
          //             <SidebarMenuItem key={item.title}>
          //               <SidebarMenuButton asChild>
          //                 <Link href={item.url}>
          //                   <item.icon />
          //                   <span>{item.title}</span>
          //                 </Link>
          //               </SidebarMenuButton>
          //             </SidebarMenuItem>
          //           ))}
          //         </SidebarMenu>
          //       </SidebarGroupContent>
          //     </CollapsibleContent>
          //   </SidebarGroup>
          // </Collapsible>
        ))} */}
      </SidebarContent>
      <SidebarRail />

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
