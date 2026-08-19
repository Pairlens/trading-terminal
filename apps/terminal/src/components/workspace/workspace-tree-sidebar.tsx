// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FolderPlus, LayoutTemplate, Plus } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@pairlens/ui/components/ui/sidebar'

import { useCreateWorkspaceDialogStore } from '@/stores/create-workspace-dialog-store'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog'
import { EditWorkspaceDialog } from '@/components/workspace/edit-workspace-dialog'
import { WorkspaceTree } from '@/components/workspace/workspace-tree'
import { ShareWorkspaceDialog } from '@/components/workspace-store/share-workspace-dialog'

export function WorkspaceTreeSidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // Load workspaces on mount
  const load = useCustomWorkspacesStore((s) => s.load)
  useEffect(() => {
    load()
  }, [load])

  const workspaces = useCustomWorkspacesStore((s) => s.workspaces)
  const folders = useCustomWorkspacesStore((s) => s.folders)
  const updateWorkspace = useCustomWorkspacesStore((s) => s.updateWorkspace)
  const deleteWorkspace = useCustomWorkspacesStore((s) => s.deleteWorkspace)
  const moveWorkspace = useCustomWorkspacesStore((s) => s.moveWorkspace)
  const createFolder = useCustomWorkspacesStore((s) => s.createFolder)
  const renameFolder = useCustomWorkspacesStore((s) => s.renameFolder)
  const deleteFolderAction = useCustomWorkspacesStore((s) => s.deleteFolder)
  const moveFolder = useCustomWorkspacesStore((s) => s.moveFolder)

  // Store-backed so the omni search palette can open it from anywhere
  const createOpen = useCreateWorkspaceDialogStore((s) => s.isOpen)
  const setCreateOpen = useCreateWorkspaceDialogStore((s) => s.setOpen)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [shareTargetId, setShareTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
    type: 'workspace' | 'folder'
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{
    id: string
    name: string
    type: 'workspace' | 'folder'
  } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<
    string | null | undefined
  >(undefined) // undefined = dialog closed

  const activeWorkspaceId = (() => {
    const match = location.pathname.match(/^\/workspace\/(.+)$/)
    return match?.[1] ?? null
  })()

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'workspace') {
      const wasActive = activeWorkspaceId === deleteTarget.id
      deleteWorkspace(deleteTarget.id)
      if (wasActive) {
        void navigate({ to: '/' })
      }
    } else {
      deleteFolderAction(deleteTarget.id)
    }
    setDeleteTarget(null)
  }, [
    deleteTarget,
    activeWorkspaceId,
    deleteWorkspace,
    deleteFolderAction,
    navigate,
  ])

  const handleRename = useCallback(() => {
    if (!renameTarget || !renameDraft.trim()) return
    if (renameTarget.type === 'workspace') {
      updateWorkspace(renameTarget.id, { name: renameDraft.trim() })
    } else {
      renameFolder(renameTarget.id, renameDraft.trim())
    }
    setRenameTarget(null)
  }, [renameTarget, renameDraft, updateWorkspace, renameFolder])

  const handleCreateFolder = useCallback(
    (name: string, parentId: string | null) => {
      createFolder(name, parentId)
      setNewFolderParentId(undefined)
    },
    [createFolder],
  )

  return (
    <>
      <header className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-[12.5px] leading-none font-medium tracking-[-0.005em] text-foreground">
          {t('layout.workspaces')}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void navigate({ to: '/workspace-store' })}
            aria-label={t('nav.workspaceStore')}
          >
            <LayoutTemplate className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setNewFolderParentId(null)}
            aria-label={t('workspace.folder.new')}
          >
            <FolderPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCreateOpen(true)}
            aria-label={t('nav.newWorkspace')}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </header>
      <SidebarContent>
        {workspaces.length === 0 && folders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              {t('workspace.emptyState', 'No workspaces yet')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              {t('workspace.createFirst', 'Create your first workspace')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => void navigate({ to: '/workspace-store' })}
            >
              <LayoutTemplate className="size-3.5" />
              {t('workspaceStore.browseTemplates', 'Browse templates')}
            </Button>
          </div>
        ) : (
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <WorkspaceTree
                  workspaces={workspaces}
                  folders={folders}
                  activeWorkspaceId={activeWorkspaceId}
                  onNavigate={(wsId) =>
                    void navigate({
                      to: '/workspace/$workspaceId',
                      params: { workspaceId: wsId },
                    })
                  }
                  onRenameWorkspace={(id, name) => {
                    setRenameTarget({ id, name, type: 'workspace' })
                    setRenameDraft(name)
                  }}
                  onChangeIcon={(wsId, iconName) =>
                    updateWorkspace(wsId, { icon: iconName })
                  }
                  onEditVariables={(wsId) => setEditTargetId(wsId)}
                  onShareWorkspace={(wsId) => setShareTargetId(wsId)}
                  onDeleteWorkspace={(id, name) =>
                    setDeleteTarget({ id, name, type: 'workspace' })
                  }
                  onMoveWorkspace={moveWorkspace}
                  onRenameFolder={(id, name) => {
                    setRenameTarget({ id, name, type: 'folder' })
                    setRenameDraft(name)
                  }}
                  onDeleteFolder={(id, name) =>
                    setDeleteTarget({ id, name, type: 'folder' })
                  }
                  onNewSubfolder={(parentId) => setNewFolderParentId(parentId)}
                  onMoveFolder={moveFolder}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Dialogs */}
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditWorkspaceDialog
        workspace={workspaces.find((w) => w.id === editTargetId) ?? null}
        open={editTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setEditTargetId(null)
        }}
      />

      <ShareWorkspaceDialog
        workspace={workspaces.find((w) => w.id === shareTargetId) ?? null}
        open={shareTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setShareTargetId(null)
        }}
      />

      {/* Rename dialog (workspace or folder) */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {renameTarget?.type === 'folder'
                ? t('workspace.folder.rename')
                : t('workspace.renameTitle')}
            </DialogTitle>
            <DialogDescription>
              {renameTarget?.type === 'folder'
                ? t('workspace.folder.renameDescription')
                : t('workspace.renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder={
              renameTarget?.type === 'folder'
                ? t('workspace.folder.namePlaceholder')
                : t('workspace.namePlaceholder')
            }
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t('workspace.cancel')}
            </Button>
            <Button onClick={handleRename} disabled={!renameDraft.trim()}>
              {t('workspace.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (workspace or folder) */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.type === 'folder'
                ? t('workspace.folder.delete')
                : t('workspace.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'folder' ? (
                t('workspace.folder.deleteDescription')
              ) : (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t('workspace.deleteDescription', {
                      name: deleteTarget?.name,
                    }),
                  }}
                />
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('workspace.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {deleteTarget?.type === 'folder'
                ? t('workspace.folder.deleteConfirm')
                : t('workspace.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <NewFolderDialog
        open={newFolderParentId !== undefined}
        parentId={newFolderParentId ?? null}
        onClose={() => setNewFolderParentId(undefined)}
        onCreate={handleCreateFolder}
      />
    </>
  )
}

function NewFolderDialog({
  open,
  parentId,
  onClose,
  onCreate,
}: {
  open: boolean
  parentId: string | null
  onClose: () => void
  onCreate: (name: string, parentId: string | null) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(name.trim(), parentId)
    setName('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('workspace.folder.new')}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workspace.folder.namePlaceholder')}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('workspace.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            {t('workspace.folder.new')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
