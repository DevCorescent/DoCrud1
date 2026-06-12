'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { renderDocumentTemplate } from '@/lib/template';
import { DocumentTemplate, DocumentField } from '@/types/document';
import { Plus, Trash2, MoveUp, MoveDown, Save, Eye } from 'lucide-react';
import RichTextEditor from './RichTextEditor';

interface TemplateEditorProps {
  template?: DocumentTemplate;
  onSave: (template: DocumentTemplate) => void;
  onClose: () => void;
}

export default function TemplateEditor({ template, onSave, onClose }: TemplateEditorProps) {
  const { data: session } = useSession();
  const [formData, setFormData] = useState<Partial<DocumentTemplate>>({
    name: '',
    description: '',
    category: 'General',
    fields: [],
    template: '',
    isCustom: true,
    ...template,
  });
  const [previewData, setPreviewData] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const categories = ['HR', 'Legal', 'Finance', 'General'];

  const addField = () => {
    const newField: DocumentField = {
      id: `field-${Date.now()}`,
      name: '',
      label: '',
      type: 'text',
      required: false,
      order: formData.fields?.length || 0,
    };
    setFormData(prev => ({
      ...prev,
      fields: [...(prev.fields || []), newField],
    }));
  };

  const updateField = (fieldId: string, updates: Partial<DocumentField>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields?.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      ),
    }));
  };

  const removeField = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields?.filter(field => field.id !== fieldId),
    }));
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    setFormData(prev => {
      const fields = [...(prev.fields || [])];
      const index = fields.findIndex(f => f.id === fieldId);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= fields.length) return prev;

      [fields[index], fields[newIndex]] = [fields[newIndex], fields[index]];
      fields.forEach((field, i) => field.order = i);

      return { ...prev, fields };
    });
  };

  const generatePreview = () => {
    return renderDocumentTemplate(
      {
        id: template?.id || 'preview',
        name: formData.name || 'Preview',
        category: formData.category || 'General',
        fields: formData.fields || [],
        template: formData.template || '',
        isCustom: true,
      },
      previewData,
      { renderMode: 'plain' }
    );
  };

  const handleSave = () => {
    if (!formData.name || !formData.template) {
      setErrorMessage('Template name and HTML are required.');
      return;
    }

    if (formData.fields?.some((field) => !field.name.trim() || !field.label.trim())) {
      setErrorMessage('Every field must include both a field name and label.');
      return;
    }

    const templateToSave: DocumentTemplate = {
      id: template?.id || `custom-${Date.now()}`,
      name: formData.name,
      description: formData.description,
      category: formData.category || 'General',
      fields: formData.fields || [],
      template: formData.template,
      isCustom: true,
      createdBy: session?.user?.email || undefined,
      createdAt: template?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: (template?.version || 0) + 1,
    };

    setErrorMessage('');
    onSave(templateToSave);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">
          {template ? 'Edit Template' : 'Create New Template'}
        </h1>
        <div className="space-x-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-2" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter template name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter template description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Template Fields</CardTitle>
              <Button onClick={addField} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Field
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {formData.fields?.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Field Name *</label>
                        <Input
                          value={field.name}
                          onChange={(e) => updateField(field.id, { name: e.target.value })}
                          placeholder="field_name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Label *</label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                          placeholder="Field Label"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Type</label>
                        <Select
                          value={field.type}
                          onValueChange={(value: any) => updateField(field.id, { type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="textarea">Textarea</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="select">Select</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        <label className="text-sm">Required</label>
                      </div>
                    </div>
                    {field.type === 'select' && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium mb-1">Options (comma-separated)</label>
                        <Input
                          value={field.options?.join(', ') || ''}
                          onChange={(e) => updateField(field.id, {
                            options: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                          })}
                          placeholder="Option 1, Option 2, Option 3"
                        />
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveField(field.id, 'up')}
                          disabled={index === 0}
                        >
                          <MoveUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveField(field.id, 'down')}
                          disabled={index === (formData.fields?.length || 0) - 1}
                        >
                          <MoveDown className="w-4 h-4" />
                        </Button>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeField(field.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template HTML</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.template}
                onChange={(e) => setFormData(prev => ({ ...prev, template: e.target.value }))}
                placeholder="Enter HTML template with {{fieldName}} placeholders"
                rows={20}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Use {'{{fieldName}}'} syntax to insert dynamic fields. Example: Hello {'{{name}}'}
              </p>
            </CardContent>
          </Card>

          {showPreview && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {formData.fields?.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium mb-1">
                        {field.label} {field.required && '*'}
                      </label>
                      {field.type === 'textarea' ? (
                        <RichTextEditor
                          value={previewData[field.name] || ''}
                          onChange={(nextValue) => setPreviewData(prev => ({
                            ...prev,
                            [field.name]: nextValue
                          }))}
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      ) : field.type === 'select' ? (
                        <Select
                          value={previewData[field.name] || ''}
                          onValueChange={(value) => setPreviewData(prev => ({
                            ...prev,
                            [field.name]: value
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(option => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={field.type}
                          value={previewData[field.name] || ''}
                          onChange={(e) => setPreviewData(prev => ({
                            ...prev,
                            [field.name]: e.target.value
                          }))}
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Rendered Preview</h3>
                  <iframe
                    title="Template Preview"
                    srcDoc={generatePreview()}
                    className="w-full min-h-[700px] rounded border bg-white"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
