import { computed } from 'vue'
import type { useResumeStore } from '@/stores/resume'
import { stripHtml } from '@/services/htmlUtils'

type ResumeStore = ReturnType<typeof useResumeStore>

export function useModuleCompletion(store: ResumeStore) {
  function hasTextContent(value: string | undefined): boolean {
    if (!value) return false
    return stripHtml(value).length > 0
  }

  function countFilled(values: Array<string | undefined>): number {
    return values.reduce((count, value) => count + (value?.trim() ? 1 : 0), 0)
  }

  function scoreByFilled(values: Array<string | undefined>): number {
    if (values.length === 0) return 0
    return countFilled(values) / values.length
  }

  const moduleCompletion = computed<Record<string, number>>(() => {
    const basic = store.basicInfo

    const basicInfoScore = scoreByFilled([
      basic.name,
      basic.phone,
      basic.email,
      basic.jobTitle,
      basic.expectedLocation,
      basic.educationLevel,
    ])

    const firstEducation = store.educationList.find((e) =>
      [e.school, e.major, e.degree, e.startDate].some((value) => value?.trim())
    )
    const educationScore = firstEducation
      ? scoreByFilled([firstEducation.school, firstEducation.major, firstEducation.degree, firstEducation.startDate])
      : 0

    const firstWork = store.workList.find((w) =>
      [w.company, w.position, w.startDate, w.description].some((value) => value?.trim())
    )
    const workScore = firstWork
      ? scoreByFilled([firstWork.company, firstWork.position, firstWork.startDate, firstWork.description])
      : 0

    const firstProject = store.projectList.find((p) =>
      [p.name, p.role, p.startDate, p.mainWork].some((value) => value?.trim())
    )
    const projectScore = firstProject
      ? scoreByFilled([firstProject.name, firstProject.role, firstProject.startDate, firstProject.mainWork])
      : 0

    const firstAward = store.awardList.find((a) => [a.name, a.date].some((value) => value?.trim()))
    const awardsScore = firstAward ? scoreByFilled([firstAward.name, firstAward.date]) : 0

    return {
      basicInfo: basicInfoScore,
      education: educationScore,
      skills: hasTextContent(store.skills) ? 1 : 0,
      workExperience: workScore,
      projectExperience: projectScore,
      awards: awardsScore,
      selfIntro: hasTextContent(store.selfIntro) ? 1 : 0,
    }
  })

  const completionPercent = computed(() => {
    const enabledModules = store.modules.filter((m) => m.visible)
    if (enabledModules.length === 0) return 0
    const total = enabledModules.reduce((sum, mod) => sum + (moduleCompletion.value[mod.key] ?? 0), 0)
    return Math.round((total / enabledModules.length) * 100)
  })

  return { moduleCompletion, completionPercent }
}
