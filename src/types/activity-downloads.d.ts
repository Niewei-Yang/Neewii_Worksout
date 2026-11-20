declare module 'virtual:activity-downloads' {
  const load: (
    report: (message: string) => void
  ) => Promise<import('../utils/utils').Activity[]>;
  export default load;
}
