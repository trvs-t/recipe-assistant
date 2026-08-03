import type {
  IRecipe,
  IRecipeFlow,
  IRecipeFlowEdge,
  IRecipeFlowNode,
  IRecipeSummary,
} from './contracts';

const demoRecipes: IRecipe[] = [
  {
    id: 'demo-miso-salmon',
    title: 'Miso butter salmon',
    description: 'A glossy, savory weeknight salmon with citrus and sesame.',
    collection: 'Weeknight wins',
    tags: ['30 minutes', 'high protein', 'one pan'],
    sourceUrl: 'https://www.justonecookbook.com/miso-salmon/',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 18,
    updatedAt: '2026-07-26T08:30:00.000Z',
    status: 'parsed',
    ingredients: [
      {
        id: 'miso-salmon-1',
        quantity: 2,
        unit: 'fillets',
        name: 'salmon',
        note: 'skin on',
      },
      {
        id: 'miso-salmon-2',
        quantity: 1.5,
        unit: 'tbsp',
        name: 'white miso',
        note: null,
      },
      {
        id: 'miso-salmon-3',
        quantity: 1,
        unit: 'tbsp',
        name: 'unsalted butter',
        note: 'softened',
      },
      {
        id: 'miso-salmon-4',
        quantity: 1,
        unit: 'tsp',
        name: 'toasted sesame seeds',
        note: null,
      },
      {
        id: 'miso-salmon-5',
        quantity: 1,
        unit: 'whole',
        name: 'lemon',
        note: 'juiced',
      },
    ],
    steps: [
      {
        id: 'miso-salmon-step-1',
        title: 'Make the glaze',
        description: 'Stir the miso, butter, and lemon juice until smooth.',
        durationMinutes: 3,
      },
      {
        id: 'miso-salmon-step-2',
        title: 'Prepare the salmon',
        description: 'Pat the fillets dry and arrange them skin-side down.',
        durationMinutes: 2,
      },
      {
        id: 'miso-salmon-step-3',
        title: 'Roast the salmon',
        description: 'Brush with glaze and roast at 425°F until just cooked through.',
        durationMinutes: 18,
      },
      {
        id: 'miso-salmon-step-4',
        title: 'Finish with sesame',
        description: 'Scatter the toasted sesame seeds over the salmon before serving.',
        durationMinutes: null,
      },
    ],
    flow: {
      derivation: 'enriched',
      nodes: [
        {
          id: 'node:miso-salmon-step-1',
          stepId: 'miso-salmon-step-1',
          ingredientIds: ['miso-salmon-2', 'miso-salmon-3', 'miso-salmon-5'],
        },
        {
          id: 'node:miso-salmon-step-2',
          stepId: 'miso-salmon-step-2',
          ingredientIds: ['miso-salmon-1'],
        },
        {
          id: 'node:miso-salmon-step-3',
          stepId: 'miso-salmon-step-3',
          ingredientIds: ['miso-salmon-1'],
        },
        {
          id: 'node:miso-salmon-step-4',
          stepId: 'miso-salmon-step-4',
          ingredientIds: ['miso-salmon-4'],
        },
      ],
      edges: [
        {
          id: 'edge:miso-salmon-step-1:miso-salmon-step-3',
          fromNodeId: 'node:miso-salmon-step-1',
          toNodeId: 'node:miso-salmon-step-3',
          kind: 'dependency',
        },
        {
          id: 'edge:miso-salmon-step-2:miso-salmon-step-3',
          fromNodeId: 'node:miso-salmon-step-2',
          toNodeId: 'node:miso-salmon-step-3',
          kind: 'dependency',
        },
        {
          id: 'edge:miso-salmon-step-3:miso-salmon-step-4',
          fromNodeId: 'node:miso-salmon-step-3',
          toNodeId: 'node:miso-salmon-step-4',
          kind: 'sequence',
        },
      ],
    },
  },
  {
    id: 'demo-citrus-soba',
    title: 'Citrus soba salad',
    description: 'Cold buckwheat noodles tossed with crunchy vegetables and sesame dressing.',
    collection: 'Fresh starts',
    tags: ['vegetarian', 'make ahead', 'lunch'],
    sourceUrl: 'https://www.bonappetit.com/recipe/soba-noodle-salad',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 8,
    updatedAt: '2026-07-19T11:15:00.000Z',
    status: 'parsed',
    ingredients: [
      {
        id: 'citrus-soba-1',
        quantity: 8,
        unit: 'oz',
        name: 'soba noodles',
        note: null,
      },
      {
        id: 'citrus-soba-2',
        quantity: 2,
        unit: 'cups',
        name: 'shredded cabbage',
        note: null,
      },
      {
        id: 'citrus-soba-3',
        quantity: 3,
        unit: 'tbsp',
        name: 'sesame dressing',
        note: null,
      },
      {
        id: 'citrus-soba-4',
        quantity: 1,
        unit: 'whole',
        name: 'orange',
        note: 'segmented',
      },
    ],
    steps: [
      {
        id: 'citrus-soba-step-1',
        title: 'Cook the noodles',
        description: 'Boil the soba until tender, then rinse under cold water.',
        durationMinutes: 8,
      },
      {
        id: 'citrus-soba-step-2',
        title: 'Build the salad',
        description: 'Toss noodles with cabbage, orange segments, and dressing.',
        durationMinutes: 5,
      },
    ],
  },
  {
    id: 'demo-tomato-toast',
    title: 'Midnight tomato toast',
    description: 'The five-minute pantry supper for when the day is already too long.',
    collection: 'Comfort food',
    tags: ['quick', 'vegetarian', 'pantry'],
    sourceUrl: null,
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    updatedAt: '2026-07-12T19:00:00.000Z',
    status: 'parsed',
    ingredients: [
      {
        id: 'tomato-toast-1',
        quantity: 2,
        unit: 'slices',
        name: 'sourdough bread',
        note: 'toasted',
      },
      {
        id: 'tomato-toast-2',
        quantity: 1,
        unit: 'whole',
        name: 'ripe tomato',
        note: 'grated or finely chopped',
      },
      {
        id: 'tomato-toast-3',
        quantity: null,
        unit: null,
        name: 'olive oil and flaky salt',
        note: null,
      },
    ],
    steps: [
      {
        id: 'tomato-toast-step-1',
        title: 'Season the tomato',
        description: 'Stir the tomato with olive oil and a pinch of flaky salt.',
        durationMinutes: 2,
      },
      {
        id: 'tomato-toast-step-2',
        title: 'Top and eat',
        description: 'Spoon over toast and finish with more olive oil.',
        durationMinutes: 3,
      },
    ],
  },
];

function copyRecipe(recipe: IRecipe): IRecipe {
  return {
    ...recipe,
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: recipe.steps.map((step) => ({ ...step })),
    flow:
      recipe.flow === undefined || recipe.flow === null
        ? recipe.flow
        : copyFlow(recipe.flow),
  };
}

function copyFlow(flow: IRecipeFlow): IRecipeFlow {
  return {
    derivation: flow.derivation,
    nodes: flow.nodes.map((node: IRecipeFlowNode): IRecipeFlowNode => ({
      ...node,
      ingredientIds: [...node.ingredientIds],
    })),
    edges: flow.edges.map((edge: IRecipeFlowEdge): IRecipeFlowEdge => ({ ...edge })),
  };
}

export function getDemoRecipes(): IRecipe[] {
  return demoRecipes.map(copyRecipe);
}

export function getDemoRecipeSummaries(): IRecipeSummary[] {
  return demoRecipes.map(({ ingredients, steps, flow, ...summary }) => ({
    ...summary,
    tags: [...summary.tags],
  }));
}

export function getDemoRecipe(recipeId: string): IRecipe | null {
  const recipe: IRecipe | undefined = demoRecipes.find((item: IRecipe) => item.id === recipeId);
  return recipe === undefined ? null : copyRecipe(recipe);
}
