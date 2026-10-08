/** All goods (base.md §1; ketchup.md §4–7). Ketchup goods only appear when their module is on. */
import type { FoodDef, FoodId } from '../types/content.js';

const food = (
  id: FoodId,
  name: string,
  module: FoodDef['module'],
  category: FoodDef['category'],
  rest: Omit<FoodDef, 'id' | 'name' | 'module' | 'category'>,
): FoodDef => ({ id, name, module, category, ...rest });

export const FOODS: readonly FoodDef[] = [
  food('burger', 'Burger', 'base', 'food', { marketable: true, freezer: 'yes', countsAsFood: true, produced: true, payableAsSalary: true }),
  food('pizza', 'Pizza', 'base', 'food', { marketable: true, freezer: 'yes', countsAsFood: true, produced: true, payableAsSalary: true }),
  food('beer', 'Beer', 'base', 'drink', { marketable: true, freezer: 'yes', countsAsFood: false, produced: false, payableAsSalary: true }),
  food('lemonade', 'Lemonade', 'base', 'drink', { marketable: true, freezer: 'yes', countsAsFood: false, produced: false, payableAsSalary: true }),
  food('soft_drink', 'Soda', 'base', 'drink', { marketable: true, freezer: 'yes', countsAsFood: false, produced: false, payableAsSalary: true }),
  // ketchup.md §4: not a drink, not marketable, never frozen, not payable as salary.
  food('coffee', 'Coffee', 'ketchup:coffee', 'coffee', { marketable: false, freezer: 'no', countsAsFood: false, produced: true, payableAsSalary: false }),
  // ketchup.md §5: freezer exclusive (if any kimchi is frozen, nothing else may be).
  food('kimchi', 'Kimchi', 'ketchup:kimchi', 'kimchi', { marketable: false, freezer: 'exclusive', countsAsFood: false, produced: true, payableAsSalary: true }),
  // ketchup.md §6–7: count as food for milestones; can be frozen.
  food('sushi', 'Sushi', 'ketchup:sushi', 'food', { marketable: false, freezer: 'yes', countsAsFood: true, produced: true, payableAsSalary: true }),
  food('noodles', 'Noodles', 'ketchup:noodles', 'food', { marketable: false, freezer: 'yes', countsAsFood: true, produced: true, payableAsSalary: true }),
];

export const DRINKS = ['beer', 'lemonade', 'soft_drink'] as const;
