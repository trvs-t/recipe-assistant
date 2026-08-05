import { describe, expect, it } from 'vitest';

import {
  buildRecipeFlowGraph,
  layoutRecipeFlow,
  type RecipeFlowEdge,
  type RecipeFlowNode,
} from './recipe-flow-diagram';

import type {
  IRecipe,
  IRecipeFlow,
  IRecipeFlowEdge,
  IRecipeFlowNode,
  IRecipeStep,
} from '@/features/recipes/contracts';

const recipe: IRecipe = {
  id: 'flow-test-recipe',
  title: 'Branching test recipe',
  description: 'A recipe for testing a branching flow.',
  collection: 'Tests',
  tags: [],
  sourceUrl: 'https://www.example.com/recipes/branching',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  updatedAt: '2026-08-03T00:00:00.000Z',
  status: 'parsed',
  ingredients: [
    { id: 'ingredient-oil', quantity: 1, unit: 'tbsp', name: 'olive oil', note: null },
    { id: 'ingredient-garlic', quantity: 2, unit: 'cloves', name: 'garlic', note: null },
    { id: 'ingredient-herbs', quantity: 1, unit: 'tbsp', name: 'fresh herbs', note: null },
  ],
  steps: [
    { id: 'step-oil', title: 'Warm the oil', description: 'Heat the oil gently.', durationMinutes: 2 },
    { id: 'step-garlic', title: 'Prepare the garlic', description: 'Mince the garlic.', durationMinutes: 3 },
    { id: 'step-finish', title: 'Finish the pan', description: 'Combine everything and add herbs.', durationMinutes: 5 },
  ],
  flow: {
    derivation: 'enriched',
    nodes: [
      { id: 'node-oil', stepId: 'step-oil', ingredientIds: ['ingredient-oil'] },
      { id: 'node-garlic', stepId: 'step-garlic', ingredientIds: ['ingredient-garlic'] },
      { id: 'node-finish', stepId: 'step-finish', ingredientIds: ['ingredient-herbs'] },
    ],
    edges: [
      { id: 'edge-oil-finish', fromNodeId: 'node-oil', toNodeId: 'node-finish', kind: 'dependency' },
      { id: 'edge-garlic-finish', fromNodeId: 'node-garlic', toNodeId: 'node-finish', kind: 'dependency' },
    ],
  },
};

describe('recipe flow diagram helpers', (): void => {
  it('keeps parallel branches in the graph and lays them out separately', (): void => {
    const graph = buildRecipeFlowGraph(recipe);
    const layout = layoutRecipeFlow(graph.nodes, graph.edges);

    expect(graph.usedFallback).toBe(false);
    expect(graph.edges.map((edge: RecipeFlowEdge): string[] => [edge.source, edge.target])).toEqual([
      ['node-oil', 'node-finish'],
      ['node-garlic', 'node-finish'],
    ]);
    expect(layout.nodes.every((node: RecipeFlowNode): boolean => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);

    const oilNode: RecipeFlowNode | undefined = layout.nodes.find((node: RecipeFlowNode): boolean => node.id === 'node-oil');
    const garlicNode: RecipeFlowNode | undefined = layout.nodes.find((node: RecipeFlowNode): boolean => node.id === 'node-garlic');
    expect(oilNode?.position.x).not.toBe(garlicNode?.position.x);
  });

  it('falls back to a deterministic linear flow for missing references', (): void => {
    const validFlow: IRecipeFlow | null | undefined = recipe.flow;
    if (validFlow === undefined || validFlow === null) {
      throw new Error('The branching fixture must include a flow.');
    }

    const invalidRecipe: IRecipe = {
      ...recipe,
      flow: {
        ...validFlow,
        nodes: validFlow.nodes.map((node: IRecipeFlowNode): IRecipeFlowNode => ({
          ...node,
          ingredientIds: node.id === 'node-garlic' ? ['ingredient-missing'] : [...node.ingredientIds],
        })),
      },
    };

    const graph = buildRecipeFlowGraph(invalidRecipe);

    expect(graph.usedFallback).toBe(true);
    expect(graph.flow.derivation).toBe('linear_fallback');
    expect(graph.nodes.map((node: RecipeFlowNode): string => node.id)).toEqual(['node:step-oil', 'node:step-garlic', 'node:step-finish']);
    expect(graph.edges.map((edge: RecipeFlowEdge): string[] => [edge.source, edge.target])).toEqual([
      ['node:step-oil', 'node:step-garlic'],
      ['node:step-garlic', 'node:step-finish'],
    ]);
  });

  it('labels a valid linear derivation as fallback rather than enrichment', (): void => {
    const linearRecipe: IRecipe = {
      ...recipe,
      flow: {
        derivation: 'linear_fallback',
        nodes: recipe.steps.map((step: IRecipeStep): IRecipeFlowNode => ({
          id: `node:${step.id}`,
          stepId: step.id,
          ingredientIds: [],
        })),
        edges: recipe.steps.slice(1).map((step: IRecipeStep, index: number): IRecipeFlowEdge => ({
          id: `edge:${recipe.steps[index]?.id}:${step.id}`,
          fromNodeId: `node:${recipe.steps[index]?.id}`,
          toNodeId: `node:${step.id}`,
          kind: 'sequence',
        })),
      },
    };

    const graph = buildRecipeFlowGraph(linearRecipe);

    expect(graph.usedFallback).toBe(true);
    expect(graph.flow.derivation).toBe('linear_fallback');
  });

  it('builds source and ingredient labels from recipe data', (): void => {
    const graph = buildRecipeFlowGraph(recipe);
    const oilNode: RecipeFlowNode | undefined = graph.nodes.find((node: RecipeFlowNode): boolean => node.id === 'node-oil');

    expect(graph.sourceLabel).toBe('example.com');
    expect(oilNode?.data.ingredientLabels).toEqual(['olive oil']);
    expect(graph.nodes.find((node: RecipeFlowNode): boolean => node.id === 'node-garlic')?.data.ingredientLabels).toEqual(['garlic']);
  });
});
