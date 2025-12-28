import { create } from 'zustand';

interface UIState {
  isLoading: boolean;
  modelType: 'local' | 'volcano';
  chatMode: 'single' | 'multi_agent';

  setLoading: (loading: boolean) => void;
  setModelType: (type: 'local' | 'volcano') => void;
  setChatMode: (mode: 'single' | 'multi_agent') => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  modelType: 'local',
  chatMode: 'single',

  setLoading: (loading) => set({ isLoading: loading }),
  setModelType: (type) => set({ modelType: type }),
  setChatMode: (mode) => set({ chatMode: mode }),
}));

