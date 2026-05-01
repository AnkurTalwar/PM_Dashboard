import { useSearchParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

/** Renders an inline "filtered by project: XXX" pill when ?project= is present. */
export function ProjectFilterBadge() {
  const [params, setParams] = useSearchParams();
  const project = params.get('project');
  if (!project) return null;

  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('project');
    setParams(next, { replace: true });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Filtered by project:</span>
      <Badge variant="secondary" className="font-semibold">{project}</Badge>
      <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto" onClick={clear}>
        <X className="h-3.5 w-3.5 mr-1" /> Clear
      </Button>
      <Button size="sm" variant="link" asChild className="h-7 px-1">
        <Link to="/">Back to Health</Link>
      </Button>
    </div>
  );
}
