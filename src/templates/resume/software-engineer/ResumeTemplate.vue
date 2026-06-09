<script setup lang="ts">
import { iconPaths, iconViewBox, isFilledIcon, toHref } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'

const { store, hasAnyContent, lineOneMeta, lineTwoMeta, lineThreeMeta, moduleOrderStyle } = useResumeTemplateData()

const hasCustomLine = (line: string) => line && line.trim()

function isLastVisibleSection(key: string): boolean {
  const visibleModuleKeys = store.modules
    .filter((module) => module.visible && module.key !== 'basicInfo')
    .map((module) => module.key)
  return visibleModuleKeys[visibleModuleKeys.length - 1] === key
}
</script>

<template>
  <div class="resume-template-software-engineer">
    <header v-if="store.isModuleVisible('basicInfo')" class="resume-header">
      <div v-if="store.basicInfo.avatar" class="avatar-wrap">
        <img :src="store.basicInfo.avatar" alt="头像" />
      </div>

      <div class="header-info">
        <h1 class="name">{{ store.basicInfo.name || '软件工程师模板' }}</h1>

        <!-- Custom header lines mode -->
        <template v-if="store.basicInfo.line1 || store.basicInfo.line2 || store.basicInfo.line3 || store.basicInfo.line4">
          <div v-if="hasCustomLine(store.basicInfo.line1)" class="contact-line">
            <span class="meta-item custom-line">{{ store.basicInfo.line1 }}</span>
          </div>
          <div v-if="hasCustomLine(store.basicInfo.line2)" class="contact-line">
            <span class="meta-item custom-line">{{ store.basicInfo.line2 }}</span>
          </div>
          <div v-if="hasCustomLine(store.basicInfo.line3)" class="contact-line">
            <span class="meta-item custom-line">{{ store.basicInfo.line3 }}</span>
          </div>
          <div v-if="hasCustomLine(store.basicInfo.line4)" class="contact-line">
            <span class="meta-item custom-line">{{ store.basicInfo.line4 }}</span>
          </div>
        </template>

        <!-- Default meta display -->
        <template v-else>
          <div class="contact-line">
            <span v-for="item in lineOneMeta" :key="item.key" class="meta-item">
              <svg
                class="meta-icon-svg"
                :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
                :viewBox="iconViewBox[item.icon]"
                aria-hidden="true"
              >
                <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
              </svg>
              {{ item.text }}
            </span>
          </div>

          <div class="contact-line">
            <span v-for="item in lineTwoMeta" :key="item.key" class="meta-item">
              <svg
                class="meta-icon-svg"
                :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
                :viewBox="iconViewBox[item.icon]"
                aria-hidden="true"
              >
                <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
              </svg>
              {{ item.text }}
            </span>
          </div>

          <div v-if="lineThreeMeta.length" class="contact-line">
            <span v-for="item in lineThreeMeta" :key="item.key" class="meta-item">
              <svg
                class="meta-icon-svg"
                :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
                :viewBox="iconViewBox[item.icon]"
                aria-hidden="true"
              >
                <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
              </svg>
              <a v-if="item.isLink" class="meta-link" :href="item.href" target="_blank" rel="noopener noreferrer">{{ item.text }}</a>
              <span v-else>{{ item.text }}</span>
            </span>
          </div>
        </template>
      </div>
    </header>

    <section
      v-if="store.isModuleVisible('education') && store.educationList.some((e) => e.school)"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('education') }"
      :style="moduleOrderStyle('education')"
    >
      <h2 class="section-title">教育经历</h2>
      <article v-for="edu in store.educationList" :key="edu.id" class="entry" v-show="edu.school">
        <div class="entry-head">
          <p class="entry-main">
            <strong>{{ edu.school }}</strong>
            <template v-if="edu.schoolTag">
              <span
                v-for="(tag, idx) in edu.schoolTag.split(' ').filter(t => t)"
                :key="idx"
                class="school-tag"
              >{{ tag }}</span>
            </template>
          </p>
          <span v-if="edu.location" class="entry-date">{{ edu.location }}</span>
        </div>
        <div class="entry-head">
          <p class="entry-main">
            <span v-if="edu.major">{{ edu.major }}</span>
            <span v-if="edu.major && edu.degree" class="dot-sep">·</span>
            <span v-if="edu.degree">{{ edu.degree }}</span>
            <span v-if="(edu.major || edu.degree) && edu.college" class="dot-sep">·</span>
            <span v-if="edu.college">{{ edu.college }}</span>
            <span v-if="edu.type" class="dot-sep">·</span>
            <span v-if="edu.type">{{ edu.type }}</span>
          </p>
          <span class="entry-date">{{ edu.startDate }} ~ {{ edu.endDate || '至今' }}</span>
        </div>
        <div v-if="edu.description" class="entry-rich" v-safe-html="edu.description"></div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('skills') && store.skills"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('skills') }"
      :style="moduleOrderStyle('skills')"
    >
      <h2 class="section-title">专业技能</h2>
      <div class="entry-rich" v-safe-html="store.skills"></div>
    </section>

    <section
      v-if="store.isModuleVisible('certificate') && store.certificate"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('certificate') }"
      :style="moduleOrderStyle('certificate')"
    >
      <h2 class="section-title">技能证书</h2>
      <div class="certificate-list">
        <div v-for="(line, idx) in store.certificate.split('\n').filter(l => l.trim())" :key="idx" class="certificate-item">
          {{ line }}
        </div>
      </div>
    </section>

    <section
      v-if="store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('workExperience') }"
      :style="moduleOrderStyle('workExperience')"
    >
      <h2 class="section-title">工作经历</h2>
      <article v-for="work in store.workList" :key="work.id" class="entry" v-show="work.company">
        <div class="entry-head">
          <p class="entry-main entry-main-wrap">
            <strong>{{ work.company }}</strong>
            <span v-if="work.department">{{ work.department }}</span>
            <span v-if="work.department && work.position" class="dot-sep">·</span>
            <span v-if="work.position">{{ work.position }}</span>
            <span v-if="(work.department || work.position) && work.location" class="dot-sep">·</span>
            <span v-if="work.location">{{ work.location }}</span>
          </p>
          <span class="entry-date">{{ work.startDate }} ~ {{ work.endDate || '至今' }}</span>
        </div>
        <div v-if="work.description" class="entry-rich" v-safe-html="work.description"></div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('projectExperience') && store.projectList.some((p) => p.name)"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('projectExperience') }"
      :style="moduleOrderStyle('projectExperience')"
    >
      <h2 class="section-title">项目经历</h2>
      <article v-for="project in store.projectList" :key="project.id" class="entry" v-show="project.name">
        <div class="entry-head">
          <p class="entry-main">
            <strong>{{ project.name }}</strong>
            <span v-if="project.role">{{ project.role }}</span>
          </p>
          <span class="entry-date">{{ project.startDate }} ~ {{ project.endDate || '至今' }}</span>
        </div>
        <p v-if="project.link" class="entry-link-row">
          <a class="entry-link" :href="toHref(project.link)" target="_blank" rel="noopener noreferrer">{{ project.link }}</a>
        </p>
        <div v-if="project.introduction">
          <div class="entry-rich" v-safe-html="project.introduction"></div>
        </div>
        <div v-if="project.mainWork">
          <div class="entry-rich" v-safe-html="project.mainWork"></div>
        </div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('awards') && store.awardList.some((a) => a.name)"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('awards') }"
      :style="moduleOrderStyle('awards')"
    >
      <h2 class="section-title">荣誉奖项</h2>
      <article v-for="award in store.awardList" :key="award.id" class="entry" v-show="award.name">
        <div class="entry-head">
          <p class="entry-main"><strong>{{ award.name }}</strong></p>
          <span class="entry-date">{{ award.date }}</span>
        </div>
        <div v-if="award.description" class="entry-rich" v-safe-html="award.description"></div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('selfIntro') && store.selfIntro"
      class="resume-section"
      :class="{ 'resume-section-last': isLastVisibleSection('selfIntro') }"
      :style="moduleOrderStyle('selfIntro')"
    >
      <h2 class="section-title">个人简介</h2>
      <div class="entry-rich" v-safe-html="store.selfIntro"></div>
    </section>

    <div v-if="!hasAnyContent" class="empty">
      <p>在左侧填写信息，这里实时预览</p>
    </div>
  </div>
</template>

<style scoped>
.resume-template-software-engineer {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 16px;
  color: #222;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
}

/* ── Header: photo left, info right ── */
.resume-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 2px solid #2a5caa;
  order: 0;
}

.avatar-wrap {
  width: 100px;
  height: 128px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid #d0dbed;
}

.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-info {
  flex: 1;
  padding-top: 2px;
}

.name {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: #1a1a1a;
  margin-bottom: 10px;
}

.contact-line {
  display: flex;
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 5px;
  color: #333;
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 4px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  line-height: 1.3;
}

.custom-line {
  gap: 0;
  color: #555;
}

.meta-link {
  color: #2a5caa;
  text-decoration: none;
}

.meta-link:hover {
  color: #1a4080;
  text-decoration: underline;
}

.meta-icon-svg {
  display: block;
  width: 13px;
  height: 13px;
  fill: none;
  stroke: #2a5caa;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.meta-icon-fill {
  fill: #2a5caa;
  stroke: none;
}

/* ── Section headers: left blue border + grey bg ── */
.resume-section {
  margin-bottom: 12px;
  break-inside: auto;
  page-break-inside: auto;
}

.resume-section:last-of-type {
  margin-bottom: 0;
}

.resume-section-last {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  height: auto;
  line-height: 1;
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
  background: #f0f2f5;
  border-left: 4px solid #2a5caa;
  border-radius: 0 3px 3px 0;
}

/* ── Entry layout ── */
.entry {
  margin-bottom: 12px;
  break-inside: auto;
  page-break-inside: auto;
}

.entry:last-child {
  margin-bottom: 0;
}

.entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}

.entry-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: #222;
  font-size: 15px;
}

.entry-main-wrap {
  flex-wrap: wrap;
  gap: 4px;
  row-gap: 3px;
}

.entry-main strong {
  font-size: 15px;
  color: #111;
}

.entry-main > span:not(.school-tag) {
  font-size: 13px;
  color: #666;
}

.school-tag {
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 11px;
  color: #2563eb !important;
  background: #f0f0f0;
  border-radius: 3px;
}

.entry-date {
  color: #666;
  font-size: 13px;
  white-space: nowrap;
}

.entry-meta {
  margin-top: 1px;
  color: #666;
  font-size: 13px;
}

.entry-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.project-block-title {
  margin-top: 4px;
  margin-bottom: 2px;
  color: #222;
  font-size: 13px;
  font-weight: 700;
}

.entry-link-row {
  margin-top: 2px;
  margin-bottom: 2px;
}

.entry-link {
  color: #2a5caa;
  font-size: 13px;
  text-decoration: none;
}

.entry-link:hover {
  text-decoration: underline;
}

/* ── Rich text ── */
.entry-rich {
  margin-top: 3px;
  color: #333;
  font-size: 12px;
  line-height: 1.75;
  break-inside: auto;
  page-break-inside: auto;
}

.certificate-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.certificate-item {
  font-size: 12px;
  color: #333;
}

/* ── Empty state ── */
.empty {
  margin-top: 40px;
  text-align: center;
  color: #aaa;
  font-size: 12px;
  order: 999;
}

/* ── Rich text nested elements ── */
:deep(.entry-rich ul) {
  margin: 0;
  padding: 0;
  list-style: none;
}

:deep(.entry-rich ul li) {
  position: relative;
  margin: 2px 0;
  padding-left: 16px;
  break-inside: avoid;
}

:deep(.entry-rich ul li::marker) {
  content: '';
}

:deep(.entry-rich ul li::before) {
  content: '';
  position: absolute;
  left: 2px;
  top: 0.95em;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

:deep(.entry-rich ol) {
  margin: 0;
  padding-left: 1.25em;
  list-style: decimal;
  list-style-position: outside;
}

:deep(.entry-rich ol li) {
  margin: 2px 0;
  padding-left: 0.1em;
  break-inside: avoid;
}

:deep(.entry-rich ol li::marker) {
  color: currentColor;
  font-size: 1em;
  font-weight: inherit;
}

:deep(.entry-rich li > p) {
  margin: 0;
}

:deep(.entry-rich p) {
  margin: 2px 0;
  break-inside: avoid;
}
</style>
