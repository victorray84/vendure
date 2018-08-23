import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

import { ID, PaginatedList } from '../../../shared/shared-types';
import { buildListQuery } from '../common/build-list-query';
import { ListQueryOptions } from '../common/common-types';
import { DEFAULT_LANGUAGE_CODE } from '../common/constants';
import { assertFound } from '../common/utils';
import { FacetTranslation } from '../entity/facet/facet-translation.entity';
import { CreateFacetDto, UpdateFacetDto } from '../entity/facet/facet.dto';
import { Facet } from '../entity/facet/facet.entity';
import { LanguageCode } from '../locale/language-code';
import { Translated } from '../locale/locale-types';
import { translateDeep } from '../locale/translate-entity';
import { TranslationUpdaterService } from '../locale/translation-updater.service';

@Injectable()
export class FacetService {
    constructor(
        @InjectConnection() private connection: Connection,
        private translationUpdaterService: TranslationUpdaterService,
    ) {}

    findAll(lang: LanguageCode, options: ListQueryOptions<Facet>): Promise<PaginatedList<Translated<Facet>>> {
        const relations = ['values'];

        return buildListQuery(this.connection, Facet, options, relations)
            .getManyAndCount()
            .then(([facets, totalItems]) => {
                const items = facets.map(facet => translateDeep(facet, lang, ['values']));
                return {
                    items,
                    totalItems,
                };
            });
    }

    findOne(facetId: ID, lang: LanguageCode): Promise<Translated<Facet> | undefined> {
        const relations = ['values'];

        return this.connection.manager
            .findOne(Facet, facetId, { relations })
            .then(facet => facet && translateDeep(facet, lang, ['values']));
    }

    async create(createFacetDto: CreateFacetDto): Promise<Translated<Facet>> {
        const facet = new Facet(createFacetDto);
        const translations: FacetTranslation[] = [];

        for (const input of createFacetDto.translations) {
            const translation = new FacetTranslation(input);
            translations.push(translation);
            await this.connection.manager.save(translation);
        }

        facet.translations = translations;
        const createdFacet = await this.connection.manager.save(facet);

        return assertFound(this.findOne(createdFacet.id, DEFAULT_LANGUAGE_CODE));
    }

    async update(updateFacetDto: UpdateFacetDto): Promise<Translated<Facet>> {
        const existingTranslations = await this.connection.getRepository(FacetTranslation).find({
            where: { base: updateFacetDto.id },
            relations: ['base'],
        });

        const translationUpdater = this.translationUpdaterService.create(FacetTranslation);
        const diff = translationUpdater.diff(existingTranslations, updateFacetDto.translations);

        const facet = await translationUpdater.applyDiff(new Facet(updateFacetDto), diff);
        await this.connection.manager.save(facet);

        return assertFound(this.findOne(facet.id, DEFAULT_LANGUAGE_CODE));
    }
}