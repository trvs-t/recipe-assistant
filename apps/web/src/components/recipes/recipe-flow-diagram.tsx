import { useMemo, type CSSProperties, type ReactElement } from 'react';

import dagre, {
  type EdgeLabel,
  type Graph,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration, getSourceLabel } from '@/lib/format';

import {
  createLinearRecipeFlow,
  isRecipeFlow,
  type IRecipe,
  type IRecipeFlow,
  type IRecipeFlowEdge,
  type IRecipeFlowNode,
  type IRecipeIngredient,
  type IRecipeStep,
  type RecipeFlowEdgeKind,
} from '@/features/recipes/contracts';

export const RECIPE_FLOW_NODE_TYPE = 'recipe-step' as const;
export const RECIPE_FLOW_NODE_WIDTH = 292;
export const RECIPE_FLOW_NODE_HEIGHT = 208;

export interface IRecipeFlowNodeData {
  [key: string]: unknown;
  stepId: string;
  label: string;
  description: string;
  durationLabel: string | null;
  ingredientLabels: string[];
  stepNumber: number;
}

export type RecipeFlowNode = Node<IRecipeFlowNodeData, typeof RECIPE_FLOW_NODE_TYPE>;

export interface IRecipeFlowEdgeData {
  [key: string]: unknown;
  kind: RecipeFlowEdgeKind;
}

export type RecipeFlowEdge = Edge<IRecipeFlowEdgeData>;

export interface IRecipeFlowGraph {
  flow: IRecipeFlow;
  nodes: RecipeFlowNode[];
  edges: RecipeFlowEdge[];
  sourceLabel: string;
  usedFallback: boolean;
}

export type RecipeFlowLayoutDirection = 'TB' | 'LR';

export interface IRecipeFlowLayoutOptions {
  direction?: RecipeFlowLayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  rankSeparation?: number;
  nodeSeparation?: number;
}

export interface IRecipeFlowLayout {
  nodes: RecipeFlowNode[];
  edges: RecipeFlowEdge[];
}

interface IDagreNodePosition {
  x: number;
  y: number;
}

const recipeFlowNodeTypes: NodeTypes = {
  [RECIPE_FLOW_NODE_TYPE]: RecipeStepNode,
};

/**
 * Check that an enriched flow is complete for this recipe and remains a DAG.
 * Runtime validation is intentional because flow data can arrive from a
 * remote adapter even though the TypeScript contract is already narrowed.
 */
export function isRecipeFlowValidForRecipe(recipe: IRecipe, value: unknown): value is IRecipeFlow {
  if (!isRecipeFlow(value)) {
    return false;
  }

  const stepIds: Set<string> = new Set(recipe.steps.map((step: IRecipeStep): string => step.id));
  const ingredientIds: Set<string> = new Set(
    recipe.ingredients.map((ingredient: IRecipeIngredient): string => ingredient.id),
  );
  const nodeIds: Set<string> = new Set<string>();
  const representedStepIds: Set<string> = new Set<string>();
  const adjacency: Map<string, string[]> = new Map<string, string[]>();
  const inDegree: Map<string, number> = new Map<string, number>();
  const edgeIds: Set<string> = new Set<string>();

  for (const node of value.nodes) {
    if (
      nodeIds.has(node.id) ||
      representedStepIds.has(node.stepId) ||
      !stepIds.has(node.stepId)
    ) {
      return false;
    }

    nodeIds.add(node.id);
    representedStepIds.add(node.stepId);
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);

    for (const ingredientId of node.ingredientIds) {
      if (!ingredientIds.has(ingredientId)) {
        return false;
      }
    }
  }

  if (
    value.nodes.length !== recipe.steps.length ||
    representedStepIds.size !== stepIds.size ||
    nodeIds.size !== value.nodes.length
  ) {
    return false;
  }

  for (const edge of value.edges) {
    if (
      edgeIds.has(edge.id) ||
      edge.fromNodeId === edge.toNodeId ||
      !nodeIds.has(edge.fromNodeId) ||
      !nodeIds.has(edge.toNodeId)
    ) {
      return false;
    }

    edgeIds.add(edge.id);
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const ready: string[] = [...inDegree.entries()]
    .filter((entry: [string, number]): boolean => entry[1] === 0)
    .map((entry: [string, number]): string => entry[0]);
  let visited: number = 0;

  while (ready.length > 0) {
    const nodeId: string | undefined = ready.shift();
    if (nodeId === undefined) {
      break;
    }

    visited += 1;
    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const nextDegree: number = (inDegree.get(nextNodeId) ?? 0) - 1;
      inDegree.set(nextNodeId, nextDegree);
      if (nextDegree === 0) {
        ready.push(nextNodeId);
      }
    }
  }

  return visited === nodeIds.size;
}

/** Build React Flow nodes and edges from the recipe's canonical graph data. */
export function buildRecipeFlowGraph(recipe: IRecipe): IRecipeFlowGraph {
  const enrichedFlow: IRecipeFlow | null = recipe.flow?.derivation === 'enriched'
    && isRecipeFlowValidForRecipe(recipe, recipe.flow)
    ? recipe.flow
    : null;
  const flow: IRecipeFlow = enrichedFlow ?? createLinearRecipeFlow(recipe.steps);
  const stepIndexById: Map<string, number> = new Map<string, number>(
    recipe.steps.map((step: IRecipeStep, index: number): [string, number] => [step.id, index]),
  );
  const stepsById: Map<string, IRecipeStep> = new Map<string, IRecipeStep>(
    recipe.steps.map((step: IRecipeStep): [string, IRecipeStep] => [step.id, step]),
  );
  const ingredientsById: Map<string, IRecipeIngredient> = new Map<string, IRecipeIngredient>(
    recipe.ingredients.map(
      (ingredient: IRecipeIngredient): [string, IRecipeIngredient] => [ingredient.id, ingredient],
    ),
  );

  const orderedFlowNodes: IRecipeFlowNode[] = [...flow.nodes].sort(
    (left: IRecipeFlowNode, right: IRecipeFlowNode): number => {
      const leftIndex: number = stepIndexById.get(left.stepId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex: number = stepIndexById.get(right.stepId) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.id.localeCompare(right.id);
    },
  );
  const nodes: RecipeFlowNode[] = orderedFlowNodes.map(
    (flowNode: IRecipeFlowNode, index: number): RecipeFlowNode => {
      const step: IRecipeStep | undefined = stepsById.get(flowNode.stepId);
      if (step === undefined) {
        throw new Error(`Recipe flow step is missing: ${flowNode.stepId}`);
      }

      const ingredientLabels: string[] = flowNode.ingredientIds.flatMap((ingredientId: string): string[] => {
        const ingredient: IRecipeIngredient | undefined = ingredientsById.get(ingredientId);
        return ingredient === undefined ? [] : [ingredient.name];
      });

      return {
        id: flowNode.id,
        type: RECIPE_FLOW_NODE_TYPE,
        data: {
          stepId: step.id,
          label: step.title,
          description: step.description,
          durationLabel: step.durationMinutes === null ? null : formatDuration(step.durationMinutes),
          ingredientLabels,
          stepNumber: index + 1,
        },
        position: { x: 0, y: 0 },
        style: { width: RECIPE_FLOW_NODE_WIDTH },
      };
    },
  );
  const edges: RecipeFlowEdge[] = flow.edges.map(
    (flowEdge: IRecipeFlowEdge): RecipeFlowEdge => createReactFlowEdge(flowEdge),
  );

  return {
    flow,
    nodes,
    edges,
    sourceLabel: getSourceLabel(recipe.sourceUrl),
    usedFallback: enrichedFlow === null,
  };
}

/** Lay out a graph without mutating its input nodes or edges. */
export function layoutRecipeFlow(
  nodes: readonly RecipeFlowNode[],
  edges: readonly RecipeFlowEdge[],
  options: IRecipeFlowLayoutOptions = {},
): IRecipeFlowLayout {
  const direction: RecipeFlowLayoutDirection = options.direction ?? 'TB';
  const nodeWidth: number = options.nodeWidth ?? RECIPE_FLOW_NODE_WIDTH;
  const nodeHeight: number = options.nodeHeight ?? RECIPE_FLOW_NODE_HEIGHT;
  const rankSeparation: number = options.rankSeparation ?? 76;
  const nodeSeparation: number = options.nodeSeparation ?? 48;
  const dagreGraph: Graph<GraphLabel, NodeLabel, EdgeLabel> = new dagre.graphlib.Graph();

  dagreGraph.setDefaultEdgeLabel((): EdgeLabel => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: rankSeparation,
    nodesep: nodeSeparation,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    const measuredWidth: number = node.measured?.width ?? node.width ?? nodeWidth;
    const measuredHeight: number = node.measured?.height ?? node.height ?? nodeHeight;
    const graphNode: NodeLabel = { width: measuredWidth, height: measuredHeight };
    dagreGraph.setNode(node.id, graphNode);
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const isHorizontal: boolean = direction === 'LR';
  const layoutedNodes: RecipeFlowNode[] = nodes.map(
    (node: RecipeFlowNode, index: number): RecipeFlowNode => {
      const measuredWidth: number = node.measured?.width ?? node.width ?? nodeWidth;
      const measuredHeight: number = node.measured?.height ?? node.height ?? nodeHeight;
      const rawPosition: unknown = dagreGraph.node(node.id);
      const position: IDagreNodePosition = isDagreNodePosition(rawPosition)
        ? rawPosition
        : {
            x: measuredWidth / 2 + index * (measuredWidth + nodeSeparation),
            y: measuredHeight / 2,
          };

      return {
        ...node,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
        position: {
          x: position.x - measuredWidth / 2,
          y: position.y - measuredHeight / 2,
        },
      };
    },
  );

  return {
    nodes: layoutedNodes,
    edges: edges.map((edge: RecipeFlowEdge): RecipeFlowEdge => ({ ...edge })),
  };
}

export interface IRecipeFlowDiagramProps {
  recipe: IRecipe;
}

export function RecipeFlowDiagram({ recipe }: IRecipeFlowDiagramProps): ReactElement {
  const graph: IRecipeFlowGraph = useMemo((): IRecipeFlowGraph => buildRecipeFlowGraph(recipe), [recipe]);
  const layout: IRecipeFlowLayout = useMemo(
    (): IRecipeFlowLayout => layoutRecipeFlow(graph.nodes, graph.edges),
    [graph.edges, graph.nodes],
  );

  const ingredientLabelsByNodeId: Map<string, string[]> = new Map<string, string[]>(
    graph.nodes.map((node: RecipeFlowNode): [string, string[]] => [node.id, node.data.ingredientLabels]),
  );

  if (graph.usedFallback) {
    return (
      <Card>
        <CardHeader className="border-b border-[var(--border)] bg-[var(--card-muted)]">
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <RecipeStepList
            ingredientLabelsByNodeId={ingredientLabelsByNodeId}
            nodes={graph.nodes}
            recipe={recipe}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--border)] bg-[var(--card-muted)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Recipe as a flow</CardTitle>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Enriched dependencies reveal which preparation branches can run in parallel.
            </p>
          </div>
          <Badge variant="success">Enriched flow</Badge>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted-foreground)]">
          <span>Source: {graph.sourceLabel}</span>
          <span>{graph.nodes.length} steps</span>
          <span>{recipe.ingredients.length} ingredients</span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          aria-label="Interactive recipe dependency flow"
          className="h-[30rem] min-h-[28rem] w-full sm:h-[min(70vh,42rem)]"
        >
          <ReactFlow
            nodes={layout.nodes}
            edges={layout.edges}
            nodeTypes={recipeFlowNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1.1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            selectionOnDrag={false}
            connectOnClick={false}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            minZoom={0.35}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <details className="border-t border-[var(--border)] px-5 py-4 sm:px-6" open>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">
            Step-by-step recipe summary
          </summary>
          <RecipeStepList
            className="mt-4"
            ingredientLabelsByNodeId={ingredientLabelsByNodeId}
            nodes={graph.nodes}
            recipe={recipe}
          />
        </details>
      </CardContent>
    </Card>
  );
}

interface IRecipeStepListProps {
  recipe: IRecipe;
  nodes: RecipeFlowNode[];
  ingredientLabelsByNodeId: Map<string, string[]>;
  className?: string;
}

function RecipeStepList({
  recipe,
  nodes,
  ingredientLabelsByNodeId,
  className = '',
}: IRecipeStepListProps): ReactElement {
  return (
    <ol aria-label="Ordered recipe steps" className={`${className} list-decimal space-y-4 pl-5 text-sm`}>
      {recipe.steps.map((step: IRecipeStep): ReactElement => {
        const flowNode: RecipeFlowNode | undefined = nodes.find(
          (node: RecipeFlowNode): boolean => node.data.stepId === step.id,
        );
        const ingredientLabels: string[] = flowNode === undefined
          ? []
          : ingredientLabelsByNodeId.get(flowNode.id) ?? [];
        const showTitle: boolean = !/^step\s+\d+$/i.test(step.title.trim());

        return (
          <li className="pl-1" key={step.id}>
            {showTitle || step.durationMinutes !== null ? (
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                {showTitle ? <span>{step.title}</span> : null}
                {step.durationMinutes !== null ? <Badge variant="secondary">{formatDuration(step.durationMinutes)}</Badge> : null}
              </div>
            ) : null}
            <p className={`${showTitle || step.durationMinutes !== null ? 'mt-1 ' : ''}leading-6 text-[var(--muted-foreground)]`}>
              {step.description}
            </p>
            {ingredientLabels.length > 0 ? (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Ingredients: {ingredientLabels.join(', ')}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function createReactFlowEdge(flowEdge: IRecipeFlowEdge): RecipeFlowEdge {
  const edgeColor: string = flowEdge.kind === 'dependency' ? 'var(--accent)' : 'var(--primary)';
  const label: string = flowEdge.kind === 'dependency' ? 'depends on' : 'next';
  const labelStyle: CSSProperties = {
    fill: 'var(--muted-foreground)',
    fontSize: 11,
    fontWeight: 600,
  };

  return {
    id: flowEdge.id,
    source: flowEdge.fromNodeId,
    target: flowEdge.toNodeId,
    type: 'smoothstep',
    data: { kind: flowEdge.kind },
    label,
    labelStyle,
    labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.95 },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
    style: { stroke: edgeColor, strokeWidth: 2 },
  };
}

function isDagreNodePosition(value: unknown): value is IDagreNodePosition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const position: Record<string, unknown> = value as Record<string, unknown>;
  return typeof position.x === 'number' && typeof position.y === 'number';
}

function RecipeStepNode({ data }: NodeProps<RecipeFlowNode>): ReactElement {
  return (
    <article className="relative min-w-0 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-[var(--shadow-card)]">
      <Handle className="!h-2.5 !w-2.5 !border-2 !border-[var(--card)] !bg-[var(--primary)]" isConnectable={false} position={Position.Top} type="target" />
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary)]">
          {data.stepNumber}
        </span>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Step {data.stepNumber}</p>
          <h3 className="mt-1 text-sm font-semibold leading-5">{data.label}</h3>
        </div>
        {data.durationLabel !== null ? <Badge className="ml-auto shrink-0" variant="secondary">{data.durationLabel}</Badge> : null}
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-[var(--muted-foreground)]">{data.description}</p>
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Ingredients</p>
        {data.ingredientLabels.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {data.ingredientLabels.map((label: string): ReactElement => (
              <li className="rounded-full bg-[var(--secondary)] px-2 py-1 text-[0.7rem] font-medium text-[var(--secondary-foreground)]" key={label}>
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">No linked ingredients</p>
        )}
      </div>
      <Handle className="!h-2.5 !w-2.5 !border-2 !border-[var(--card)] !bg-[var(--primary)]" isConnectable={false} position={Position.Bottom} type="source" />
    </article>
  );
}
