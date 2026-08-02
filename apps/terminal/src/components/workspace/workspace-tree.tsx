// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  AppWindow,
  ArrowRight,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Palette,
  Pencil,
  Settings,
  Share2,
  Trash2,
} from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@pairlens/ui/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from '@pairlens/ui/components/ui/sidebar'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

import type {
  CustomWorkspaceDefinition,
  WorkspaceFolder,
} from '@/lib/layout/types'
import {
  WORKSPACE_ICONS,
  getWorkspaceIcon,
} from '@/components/workspace/workspace-icons'
import { openTerminalWindow } from '@/lib/platform'

const TREE_STATE_KEY = 'pairlens:workspace-tree-state'

function loadExpandedFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(TREE_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch {
    // ignore
  }
  return new Set()
}

function saveExpandedFolders(ids: Set<string>) {
  try {
    localStorage.setItem(TREE_STATE_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

type TreeNode =
  | {
      type: 'folder'
      folder: WorkspaceFolder
      children: Array<TreeNode>
    }
  | {
      type: 'workspace'
      workspace: CustomWorkspaceDefinition
    }

function buildTree(
  folders: Array<WorkspaceFolder>,
  workspaces: Array<CustomWorkspaceDefinition>,
  parentId: string | null,
): Array<TreeNode> {
  const childFolders = folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map(
      (folder): TreeNode => ({
        type: 'folder',
        folder,
        children: buildTree(folders, workspaces, folder.id),
      }),
    )

  const childWorkspaces = workspaces
    .filter((ws) => (ws.folderId ?? null) === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(
      (workspace): TreeNode => ({
        type: 'workspace',
        workspace,
      }),
    )

  return [...childFolders, ...childWorkspaces]
}

export type WorkspaceTreeProps = {
  workspaces: Array<CustomWorkspaceDefinition>
  folders: Array<WorkspaceFolder>
  activeWorkspaceId: string | null
  onNavigate: (wsId: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onChangeIcon: (wsId: string, iconName: string) => void
  onEditVariables: (wsId: string) => void
  onShareWorkspace: (wsId: string) => void
  onDeleteWorkspace: (id: string, name: string) => void
  onMoveWorkspace: (wsId: string, folderId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string, name: string) => void
  onNewSubfolder: (parentId: string) => void
  onMoveFolder: (folderId: string, newParentId: string | null) => void
}

type DragItem = {
  type: 'workspace' | 'folder'
  id: string
  name: string
  icon?: string
}

export function WorkspaceTree(props: WorkspaceTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState(loadExpandedFolders)
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      saveExpandedFolders(next)
      return next
    })
  }, [])

  const expandFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      if (prev.has(folderId)) return prev
      const next = new Set(prev)
      next.add(folderId)
      saveExpandedFolders(next)
      return next
    })
  }, [])

  const tree = useMemo(
    () => buildTree(props.folders, props.workspaces, null),
    [props.folders, props.workspaces],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragItem | undefined
    if (data) setActiveItem(data)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const dragData = active.data.current as DragItem | undefined
      if (!dragData) return

      const dropId = over.id as string
      // Drop target is either a folder id (prefixed "drop-folder:") or "drop-root"
      if (dropId === 'drop-root') {
        if (dragData.type === 'workspace') {
          props.onMoveWorkspace(dragData.id, null)
        } else {
          props.onMoveFolder(dragData.id, null)
        }
      } else if (dropId.startsWith('drop-folder:')) {
        const targetFolderId = dropId.slice('drop-folder:'.length)
        // Don't drop a folder onto itself
        if (dragData.type === 'folder' && dragData.id === targetFolderId) return
        if (dragData.type === 'workspace') {
          props.onMoveWorkspace(dragData.id, targetFolderId)
        } else {
          props.onMoveFolder(dragData.id, targetFolderId)
        }
      }
    },
    [props],
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {tree.map((node) => (
        <TreeNodeItem
          key={node.type === 'folder' ? node.folder.id : node.workspace.id}
          node={node}
          depth={0}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          expandFolder={expandFolder}
          isDragging={activeItem !== null}
          {...props}
        />
      ))}
      {/* Root drop zone — visible only while dragging */}
      {activeItem && <RootDropZone />}
      <DragOverlay dropAnimation={null}>
        {activeItem && <DragOverlayContent item={activeItem} />}
      </DragOverlay>
    </DndContext>
  )
}

function RootDropZone() {
  const { t } = useTranslation()
  const { isOver, setNodeRef } = useDroppable({ id: 'drop-root' })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-2 mt-1 flex items-center justify-center rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground transition-colors',
        isOver && 'border-accent bg-accent/10 text-accent-foreground',
      )}
    >
      {t('workspace.moveToRoot')}
    </div>
  )
}

function DragOverlayContent({ item }: { item: DragItem }) {
  const Icon = item.type === 'folder' ? Folder : getWorkspaceIcon(item.icon)

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-sm shadow-md ring-1 ring-border">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{item.name}</span>
    </div>
  )
}

type TreeNodeItemProps = {
  node: TreeNode
  depth: number
  expandedFolders: Set<string>
  toggleFolder: (id: string) => void
  expandFolder: (id: string) => void
  isDragging: boolean
} & WorkspaceTreeProps

function TreeNodeItem({ node, ...rest }: TreeNodeItemProps) {
  if (node.type === 'workspace') {
    return <WorkspaceItem workspace={node.workspace} {...rest} />
  }

  return <FolderItem folder={node.folder} children={node.children} {...rest} />
}

function FolderItem({
  folder,
  children,
  depth,
  expandedFolders,
  toggleFolder,
  expandFolder,
  isDragging,
  ...props
}: {
  folder: WorkspaceFolder
  children: Array<TreeNode>
} & Omit<TreeNodeItemProps, 'node'>) {
  const { t } = useTranslation()
  const isExpanded = expandedFolders.has(folder.id)
  const allFolders = props.folders

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging: isSelfDragging,
  } = useDraggable({
    id: `drag-folder:${folder.id}`,
    data: {
      type: 'folder',
      id: folder.id,
      name: folder.name,
    } satisfies DragItem,
  })

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop-folder:${folder.id}`,
  })

  // Auto-expand folder when dragging over it
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isOver && !isExpanded && isDragging) {
      hoverTimerRef.current = setTimeout(() => expandFolder(folder.id), 500)
    }
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [isOver, isExpanded, isDragging, expandFolder, folder.id])

  return (
    <SidebarMenuItem
      ref={(el) => {
        setDragRef(el)
        setDropRef(el)
      }}
      className={cn(
        'rounded-md transition-colors',
        isSelfDragging && 'opacity-40',
        isOver && isDragging && 'bg-accent/20 ring-1 ring-inset ring-accent/60',
      )}
      {...attributes}
      {...listeners}
    >
      <Collapsible
        open={isExpanded}
        onOpenChange={() => toggleFolder(folder.id)}
      >
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <CollapsibleTrigger
                render={
                  <SidebarMenuButton
                    className="gap-1.5 pr-2"
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                  />
                }
              />
            }
          >
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
            {isExpanded ? (
              <FolderOpen className="size-3.5 shrink-0" />
            ) : (
              <Folder className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{folder.name}</span>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem
              onClick={() => props.onRenameFolder(folder.id, folder.name)}
            >
              <Pencil className="size-3.5" />
              {t('workspace.folder.rename')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => props.onNewSubfolder(folder.id)}>
              <FolderPlus className="size-3.5" />
              {t('workspace.folder.newSub')}
            </ContextMenuItem>
            {allFolders.length > 1 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <ArrowRight className="size-3.5" />
                  {t('workspace.moveTo')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  {folder.parentId !== null && (
                    <ContextMenuItem
                      onClick={() => props.onMoveFolder(folder.id, null)}
                    >
                      {t('workspace.moveToRoot')}
                    </ContextMenuItem>
                  )}
                  {allFolders
                    .filter(
                      (f) => f.id !== folder.id && f.id !== folder.parentId,
                    )
                    .map((f) => (
                      <ContextMenuItem
                        key={f.id}
                        onClick={() => props.onMoveFolder(folder.id, f.id)}
                      >
                        <Folder className="size-3.5" />
                        {f.name}
                      </ContextMenuItem>
                    ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => props.onDeleteFolder(folder.id, folder.name)}
            >
              <Trash2 className="size-3.5" />
              {t('workspace.folder.delete')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <CollapsibleContent>
          {/* No SidebarMenuSubItem wrapper: TreeNodeItem already renders its
              own SidebarMenuItem (an <li>), so wrapping would nest <li> inside
              <li> — invalid HTML that React reports as a hydration error. The
              root-level map does the same thing. */}
          <SidebarMenuSub className="ml-0 translate-x-0 border-l-0 pl-0">
            {children.map((child) => (
              <TreeNodeItem
                key={
                  child.type === 'folder' ? child.folder.id : child.workspace.id
                }
                node={child}
                depth={depth + 1}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                expandFolder={expandFolder}
                isDragging={isDragging}
                {...props}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

function WorkspaceItem({
  workspace,
  depth,
  activeWorkspaceId,
  folders,
  isDragging: _isDragging,
  expandedFolders: _expandedFolders,
  toggleFolder: _toggleFolder,
  expandFolder: _expandFolder,
  onNavigate,
  onRenameWorkspace,
  onChangeIcon,
  onEditVariables,
  onShareWorkspace,
  onDeleteWorkspace,
  onMoveWorkspace,
}: {
  workspace: CustomWorkspaceDefinition
} & Omit<TreeNodeItemProps, 'node'>) {
  const { t } = useTranslation()
  const WsIcon = getWorkspaceIcon(workspace.icon)

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: isSelfDragging,
  } = useDraggable({
    id: `drag-workspace:${workspace.id}`,
    data: {
      type: 'workspace',
      id: workspace.id,
      name: workspace.name,
      icon: workspace.icon,
    } satisfies DragItem,
  })

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      className={cn(isSelfDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <SidebarMenuButton
              isActive={activeWorkspaceId === workspace.id}
              onClick={() => onNavigate(workspace.id)}
              className="gap-1.5 pr-2"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            />
          }
        >
          <WsIcon className="size-3.5 shrink-0" />
          <span className="truncate">{workspace.name}</span>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={() =>
              void openTerminalWindow(`/workspace/${workspace.id}`)
            }
          >
            <AppWindow className="size-3.5" />
            {t('workspace.openInNewWindow')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onRenameWorkspace(workspace.id, workspace.name)}
          >
            <Pencil className="size-3.5" />
            {t('workspace.rename')}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette className="size-3.5" />
              {t('workspace.changeIcon')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52 p-2">
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(WORKSPACE_ICONS).map(([name, IconComp]) => (
                  <button
                    key={name}
                    type="button"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md transition-colors',
                      workspace.icon === name ||
                        (!workspace.icon && name === 'Layers')
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                    onClick={() => onChangeIcon(workspace.id, name)}
                  >
                    <IconComp className="size-4" />
                  </button>
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={() => onEditVariables(workspace.id)}>
            <Settings className="size-3.5" />
            {t('workspace.editVariables')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onShareWorkspace(workspace.id)}>
            <Share2 className="size-3.5" />
            {t('workspace.shareToStore', 'Share to store…')}
          </ContextMenuItem>
          {folders.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ArrowRight className="size-3.5" />
                {t('workspace.moveTo')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                {workspace.folderId && (
                  <ContextMenuItem
                    onClick={() => onMoveWorkspace(workspace.id, null)}
                  >
                    {t('workspace.moveToRoot')}
                  </ContextMenuItem>
                )}
                {folders
                  .filter((f) => f.id !== workspace.folderId)
                  .map((f) => (
                    <ContextMenuItem
                      key={f.id}
                      onClick={() => onMoveWorkspace(workspace.id, f.id)}
                    >
                      <Folder className="size-3.5" />
                      {f.name}
                    </ContextMenuItem>
                  ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => onDeleteWorkspace(workspace.id, workspace.name)}
          >
            <Trash2 className="size-3.5" />
            {t('workspace.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  )
}
