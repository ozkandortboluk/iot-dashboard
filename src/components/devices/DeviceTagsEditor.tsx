import React, { useState } from 'react';
import { Tag, Plus, X } from 'lucide-react';

interface DeviceTagsEditorProps {
  tags?: string[];
  onSaveTags: (tags: string[]) => Promise<void> | void;
  readOnly?: boolean;
}

export const DeviceTagsEditor: React.FC<DeviceTagsEditorProps> = ({
  tags = [],
  onSaveTags,
  readOnly = false,
}) => {
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setCurrentTags(tags || []);
  }, [tags]);

  const handleAddTag = async () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed || currentTags.includes(trimmed)) {
      setNewTagInput('');
      setIsAdding(false);
      return;
    }

    const updated = [...currentTags, trimmed];
    setCurrentTags(updated);
    setNewTagInput('');
    setIsAdding(false);
    setSaving(true);
    try {
      await onSaveTags(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = currentTags.filter((t) => t !== tagToRemove);
    setCurrentTags(updated);
    setSaving(true);
    try {
      await onSaveTags(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="device-tags-editor" className="flex flex-wrap items-center gap-1.5">
      {currentTags.map((tag) => (
        <span
          key={tag}
          id={`device-tag-${tag}`}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/50"
        >
          <Tag className="w-2.5 h-2.5 text-indigo-400" />
          <span>{tag}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              disabled={saving}
              className="p-0.5 hover:text-rose-400 text-indigo-400 rounded-full transition-colors"
              title="Etiketi kaldır"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}

      {!readOnly && (
        <>
          {isAdding ? (
            <div className="inline-flex items-center gap-1">
              <input
                id="input-new-device-tag"
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  } else if (e.key === 'Escape') {
                    setIsAdding(false);
                  }
                }}
                autoFocus
                placeholder="yeni etiket..."
                className="w-24 px-2 py-0.5 text-xs bg-slate-900 border border-indigo-500 rounded text-slate-200 focus:outline-none"
              />
              <button
                type="button"
                id="btn-confirm-add-tag"
                onClick={handleAddTag}
                className="p-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded"
              >
                Ekle
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="p-1 text-xs text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="btn-open-add-tag"
              onClick={() => setIsAdding(true)}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800/80 border border-dashed border-slate-700 hover:border-indigo-600 transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>Etiket Ekle</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
