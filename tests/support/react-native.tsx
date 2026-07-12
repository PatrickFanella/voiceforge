import React from 'react';

type Props = Record<string, unknown> & { children?: React.ReactNode };
const host = (name: string) => ({ children, ...props }: Props) => React.createElement(name, props, children);

export const View = host('View');
export const Text = host('Text');
export const ActivityIndicator = host('ActivityIndicator');
export const TouchableOpacity = host('TouchableOpacity');
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown) => style,
};
export const Platform = { OS: 'test', select: <T,>(values: { default?: T; test?: T }) => values.test ?? values.default };
